import { destr } from "destr";
import { deepOmitUnsafe, deepPickUnsafe } from "deep-pick-omit";

const serializer = {
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => destr(data),
};

// 从存储中恢复状态到store
const hydrateStore = (store, persist, context, runHooks = true) => {
  const { key, storage, pick, omit, beforeHydrate, afterHydrate, debug } =
    persist;

  try {
    if (runHooks) {
      beforeHydrate?.(context);
    }

    const fromStorage = storage.getItem(key);
    if (fromStorage) {
      const deserialized = serializer.deserialize(fromStorage);
      const picked = pick ? deepPickUnsafe(deserialized, pick) : deserialized;
      const omitted = omit ? deepOmitUnsafe(picked, omit) : picked;
      store.$patch(omitted);
    }

    if (runHooks) {
      afterHydrate?.(context);
    }
  } catch (error) {
    if (debug) {
      console.error("错误" + error);
    }
  }
};

// 将store的状态持久化到存储中
const persistState = (state, persist) => {
  const { key, storage, pick, omit, debug } = persist;
  try {
    const picked = pick ? deepPickUnsafe(state, pick) : state;
    const omitted = omit ? deepOmitUnsafe(picked, omit) : picked;
    const toStorage = serializer.serialize(omitted);
    storage.setItem(key, toStorage);
  } catch (err) {
    if (debug) {
      console.error("保存错误" + err);
    }
  }
};

const createPersisted = (context, config) => {
  const {
    store,
    options: { persist = false },
  } = context;
  // 如果不需要持久化，直接返回
  if (!persist) return;

  // 获取persist中的配置项
  const persistenceOptions = Array.isArray(persist)
    ? persist
    : persist === true
    ? [{}]
    : [persist];

  // 遍历配置项并根据全局配置设置配置的优先级
  const persistences = persistenceOptions.map((p) => {
    return {
      key: (config.key && typeof config.key === "function"
        ? config.key
        : (x) => x)(p.key ?? store.$id),
      storage: p.storage ?? config.storage ?? window.localStorage,
      pick: p.pick,
      omit: p.omit,
      beforeHydrate: p.beforeHydrate,
      afterHydrate: p.afterHydrate,
      debug: p.debug ?? config.debug ?? false,
    };
  });

  // // 从持久化存储中恢复store的状态
  // store.$hydrate = ({ runHooks = true }) => {
  //     persistences.forEach((p) => {
  //         hydrateStore(store, p, context, runHooks);
  //     })
  // }

  // // 将store的状态持久化到存储中
  // store.$persist = () => {
  //     persistences.forEach((p) => {
  //         persistState(store.$state, p)
  //     })
  // }

  persistences.forEach((persist) => {
    // 将数据从存储中恢复状态到store
    hydrateStore(store, persist, context, true);

    // 数据变化时，持久化store的状态
    store.$subscribe(
      (_mutation, state) => {
        persistState(state, persist);
      },
      { detached: true }
    );
  });
};

// 创建持久化的功能
const createPersistedState = (config = {}) => {
  return (context) => {
    createPersisted(context, config);
  };
};

export default createPersistedState;
