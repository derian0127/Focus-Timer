import { createContext, useContext, useSyncExternalStore } from "react";
import type { AppStore, Model } from "./store";

const StoreContext = createContext<AppStore | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Falta StoreProvider");
  return store;
}

export function useModel(): Model {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
