type StorageEntry = [string, string | null]

const asyncStorageShim = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
  mergeItem: async () => undefined,
  clear: async () => undefined,
  getAllKeys: async () => [],
  multiGet: async (keys: string[]): Promise<StorageEntry[]> => keys.map((key) => [key, null]),
  multiSet: async () => undefined,
  multiRemove: async () => undefined,
  multiMerge: async () => undefined,
}

export const getItem = asyncStorageShim.getItem
export const setItem = asyncStorageShim.setItem
export const removeItem = asyncStorageShim.removeItem
export const mergeItem = asyncStorageShim.mergeItem
export const clear = asyncStorageShim.clear
export const getAllKeys = asyncStorageShim.getAllKeys
export const multiGet = asyncStorageShim.multiGet
export const multiSet = asyncStorageShim.multiSet
export const multiRemove = asyncStorageShim.multiRemove
export const multiMerge = asyncStorageShim.multiMerge

export default asyncStorageShim
