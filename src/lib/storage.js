/**
 * localStorage 读写封装：浏览器禁用存储时静默失败。
 */

function readStore(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 浏览器拒绝存储时忽略
  }
}

function removeStore(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

/** 读取 JSON 形式的缓存，坏了就当没有 */
function readJsonStore(key) {
  const raw = readStore(key)
  if (raw === null || raw.length === 0) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJsonStore(key, value) {
  writeStore(key, JSON.stringify(value))
}

export { readStore, writeStore, removeStore, readJsonStore, writeJsonStore }
