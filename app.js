const STORAGE_KEY = "lockbox:vault";
const SYNC_KEY = "lockbox:sync";
const ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let masterPassword = "";
let vault = { version: 1, entries: [], updatedAt: null };
let selectedId = null;
let autoSyncTimer = null;

const $ = (id) => document.getElementById(id);

const elements = {
  unlockView: $("unlockView"),
  appView: $("appView"),
  unlockForm: $("unlockForm"),
  masterPassword: $("masterPassword"),
  toggleMaster: $("toggleMaster"),
  syncState: $("syncState"),
  lockButton: $("lockButton"),
  addButton: $("addButton"),
  searchInput: $("searchInput"),
  entryList: $("entryList"),
  entryForm: $("entryForm"),
  entryId: $("entryId"),
  entryTitle: $("entryTitle"),
  entryUrl: $("entryUrl"),
  entryUsername: $("entryUsername"),
  entryPassword: $("entryPassword"),
  entryNotes: $("entryNotes"),
  toggleEntryPassword: $("toggleEntryPassword"),
  generatePassword: $("generatePassword"),
  deleteButton: $("deleteButton"),
  copyPassword: $("copyPassword"),
  vaultCount: $("vaultCount"),
  lastSaved: $("lastSaved"),
  toast: $("toast"),
  gistToken: $("gistToken"),
  gistId: $("gistId"),
  gistFile: $("gistFile"),
  autoSync: $("autoSync"),
  saveSyncSettings: $("saveSyncSettings"),
  pullRemote: $("pullRemote"),
  pushRemote: $("pushRemote"),
  exportVault: $("exportVault"),
  importVault: $("importVault"),
};

function hasWebCrypto() {
  return Boolean(window.crypto?.subtle && window.isSecureContext);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const payload = encoder.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return {
    app: "lockbox",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    savedAt: new Date().toISOString(),
  };
}

async function decryptVault(envelope, password) {
  if (!envelope || envelope.app !== "lockbox") {
    throw new Error("不是 Lockbox 加密库文件");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

function getStoredEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function persistVault() {
  vault.updatedAt = new Date().toISOString();
  const envelope = await encryptVault(vault, masterPassword);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  updateMeta(envelope.savedAt);
}

function loadSyncSettings() {
  const settings = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
  elements.gistToken.value = settings.token || "";
  elements.gistId.value = settings.gistId || "";
  elements.gistFile.value = settings.file || "lockbox-vault.json";
  elements.autoSync.checked = Boolean(settings.autoSync);
  configureAutoSync();
  return settings;
}

function saveSyncSettings() {
  const settings = {
    token: elements.gistToken.value.trim(),
    gistId: elements.gistId.value.trim(),
    file: elements.gistFile.value.trim() || "lockbox-vault.json",
    autoSync: elements.autoSync.checked,
  };
  localStorage.setItem(SYNC_KEY, JSON.stringify(settings));
  configureAutoSync();
  showToast("同步配置已保存");
  return settings;
}

function configureAutoSync() {
  window.clearInterval(autoSyncTimer);
  const settings = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
  if (settings.autoSync && settings.token && settings.gistId) {
    autoSyncTimer = window.setInterval(() => pullFromGist(true), 30000);
  }
}

function updateMeta(savedAt) {
  elements.vaultCount.textContent = `${vault.entries.length} 项`;
  elements.lastSaved.textContent = savedAt ? `保存于 ${new Date(savedAt).toLocaleString()}` : "尚未保存";
  elements.syncState.textContent = vault.updatedAt ? `本地保存 ${new Date(vault.updatedAt).toLocaleString()}` : "本地已加密保存";
}

function filteredEntries() {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) return vault.entries;
  return vault.entries.filter((entry) => {
    return [entry.title, entry.url, entry.username, entry.notes].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function renderEntries() {
  const entries = filteredEntries().sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
  elements.entryList.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有匹配的密码项";
    elements.entryList.append(empty);
    return;
  }
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-card${entry.id === selectedId ? " active" : ""}`;
    button.innerHTML = `<strong></strong><span></span><span></span>`;
    button.querySelector("strong").textContent = entry.title || "未命名";
    button.querySelectorAll("span")[0].textContent = entry.username || "无用户名";
    button.querySelectorAll("span")[1].textContent = entry.url || "无网站";
    button.addEventListener("click", () => selectEntry(entry.id));
    elements.entryList.append(button);
  }
}

function resetEditor() {
  selectedId = null;
  elements.entryForm.reset();
  elements.entryId.value = "";
  renderEntries();
}

function selectEntry(id) {
  const entry = vault.entries.find((item) => item.id === id);
  if (!entry) return;
  selectedId = id;
  elements.entryId.value = entry.id;
  elements.entryTitle.value = entry.title || "";
  elements.entryUrl.value = entry.url || "";
  elements.entryUsername.value = entry.username || "";
  elements.entryPassword.value = entry.password || "";
  elements.entryNotes.value = entry.notes || "";
  renderEntries();
}

function generatePassword(length = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

async function saveEntry(event) {
  event.preventDefault();
  const now = new Date().toISOString();
  const id = elements.entryId.value || crypto.randomUUID();
  const entry = {
    id,
    title: elements.entryTitle.value.trim(),
    url: elements.entryUrl.value.trim(),
    username: elements.entryUsername.value.trim(),
    password: elements.entryPassword.value,
    notes: elements.entryNotes.value.trim(),
    updatedAt: now,
  };
  const existingIndex = vault.entries.findIndex((item) => item.id === id);
  if (existingIndex >= 0) {
    vault.entries[existingIndex] = entry;
  } else {
    vault.entries.push(entry);
  }
  selectedId = id;
  await persistVault();
  renderEntries();
  showToast("已加密保存");
}

async function deleteEntry() {
  if (!selectedId) {
    resetEditor();
    return;
  }
  const entry = vault.entries.find((item) => item.id === selectedId);
  if (!entry || !confirm(`删除「${entry.title || "未命名"}」？`)) return;
  vault.entries = vault.entries.filter((item) => item.id !== selectedId);
  await persistVault();
  resetEditor();
  showToast("已删除");
}

async function unlock(event) {
  event.preventDefault();
  if (!hasWebCrypto()) {
    showToast("当前环境不支持 Web Crypto。请用 HTTPS、GitHub Pages 或 localhost 打开。");
    return;
  }
  masterPassword = elements.masterPassword.value;
  if (masterPassword.length < 10) {
    showToast("主密码至少 10 位");
    return;
  }
  const envelope = getStoredEnvelope();
  try {
    vault = envelope ? await decryptVault(envelope, masterPassword) : { version: 1, entries: [], updatedAt: null };
    elements.unlockView.classList.add("hidden");
    elements.appView.classList.remove("hidden");
    updateMeta(envelope?.savedAt);
    loadSyncSettings();
    renderEntries();
    resetEditor();
    showToast(envelope ? "已解锁" : "已创建新的加密库");
    if (!envelope) await persistVault();
  } catch (error) {
    console.error(error);
    showToast("解锁失败：主密码或数据不正确");
  }
}

function lock() {
  masterPassword = "";
  vault = { version: 1, entries: [], updatedAt: null };
  selectedId = null;
  elements.masterPassword.value = "";
  elements.appView.classList.add("hidden");
  elements.unlockView.classList.remove("hidden");
  window.clearInterval(autoSyncTimer);
}

async function pushToGist() {
  const settings = saveSyncSettings();
  if (!settings.token) {
    showToast("请先填写 GitHub Token");
    return;
  }
  const envelope = await encryptVault(vault, masterPassword);
  const body = {
    description: "Lockbox encrypted password vault",
    public: false,
    files: {
      [settings.file]: {
        content: JSON.stringify(envelope, null, 2),
      },
    },
  };
  const url = settings.gistId ? `https://api.github.com/gists/${settings.gistId}` : "https://api.github.com/gists";
  const response = await fetch(url, {
    method: settings.gistId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  elements.gistId.value = result.id;
  saveSyncSettings();
  showToast("已推送到 GitHub Gist");
}

async function pullFromGist(silent = false) {
  const settings = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
  if (!settings.token || !settings.gistId) {
    if (!silent) showToast("请先保存 GitHub Token 和 Gist ID");
    return;
  }
  const response = await fetch(`https://api.github.com/gists/${settings.gistId}`, {
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  const file = result.files?.[settings.file];
  if (!file?.content) throw new Error("Gist 中没有找到加密库文件");
  const remoteEnvelope = JSON.parse(file.content);
  const remoteVault = await decryptVault(remoteEnvelope, masterPassword);
  if ((remoteVault.updatedAt || "") > (vault.updatedAt || "")) {
    vault = remoteVault;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteEnvelope));
    updateMeta(remoteEnvelope.savedAt);
    renderEntries();
    resetEditor();
    showToast("已拉取远端更新");
  } else if (!silent) {
    showToast("远端没有更新");
  }
}

function exportVault() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showToast("没有可导出的密码库");
    return;
  }
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lockbox-vault-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importVault(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const envelope = JSON.parse(await file.text());
    const imported = await decryptVault(envelope, masterPassword);
    vault = imported;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    updateMeta(envelope.savedAt);
    renderEntries();
    resetEditor();
    showToast("导入成功");
  } catch (error) {
    console.error(error);
    showToast("导入失败：主密码或文件不正确");
  } finally {
    event.target.value = "";
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    ["vault", "sync", "tools"].forEach((name) => {
      $(`${name}Pane`).classList.toggle("hidden", tab.dataset.view !== name);
    });
  });
});

elements.unlockForm.addEventListener("submit", unlock);
elements.toggleMaster.addEventListener("click", () => {
  elements.masterPassword.type = elements.masterPassword.type === "password" ? "text" : "password";
});
elements.lockButton.addEventListener("click", lock);
elements.addButton.addEventListener("click", resetEditor);
elements.searchInput.addEventListener("input", renderEntries);
elements.entryForm.addEventListener("submit", saveEntry);
elements.deleteButton.addEventListener("click", deleteEntry);
elements.toggleEntryPassword.addEventListener("click", () => {
  elements.entryPassword.type = elements.entryPassword.type === "password" ? "text" : "password";
});
elements.generatePassword.addEventListener("click", () => {
  elements.entryPassword.value = generatePassword();
});
elements.copyPassword.addEventListener("click", async () => {
  if (!elements.entryPassword.value) return;
  await navigator.clipboard.writeText(elements.entryPassword.value);
  showToast("密码已复制");
});
elements.saveSyncSettings.addEventListener("click", saveSyncSettings);
elements.pushRemote.addEventListener("click", () => pushToGist().catch((error) => showToast(`推送失败：${error.message}`)));
elements.pullRemote.addEventListener("click", () => pullFromGist(false).catch((error) => showToast(`拉取失败：${error.message}`)));
elements.exportVault.addEventListener("click", exportVault);
elements.importVault.addEventListener("change", importVault);
