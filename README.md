# 保姆级带你手写Pinia插件：plugin-pinia-persistence

## 简单实现 plugin-pinia-persistence

从Pinia的文档中有关于插件的相关说明，从文档中可以看到插件是通过 `pinia.use()` 添加到 pinia 实例的。

我们也可以在插件中添加属性或者方法，一个简单的例子：

```javascript
    import { createPinia } from 'pinia'

    // 创建一个插件
    const muPlugin = (context) => {
    	console.log(context) // {store, pinia, app, options}
    	// 添加属性
    	context.store.hello = 'world'
    }

    const pinia = createPinia()
    // 将该插件交给 Pinia
    pinia.use(muPlugin)
```

### 核心思路：

1、状态恢复：插件创建时，拉取本地存储中的数据，同步到pinia的state中。\
利用 `store.$patch` 方法将相关数据设置到state进行状态恢复。

![pEteon0.png](https://s21.ax1x.com/2025/03/07/pEteon0.png)

2、同步存储：创建监听，当state的数据发生变化时，将数据同步到本地存储中。\
利用 `store.$subscribe` 监听在state被修改时同步数据到指定存储里。

![pEteTBV.png](https://s21.ax1x.com/2025/03/07/pEteTBV.png)

### 代码实现：

按照核心思路可以简单实现这个插件，在pinia的文件夹下创建`plugin-persistence.js`文件，这里的存储由于是electron项目，所以我继续沿用了electron-store的存储方案。如果是web项目的话，可以根据需求改成`localstorage`或`sessionstorage` 。

```javascript
    import { destr } from 'destr'
    import electronStore from './electronStore'

    // 数据序列化的方法
    const serializer = {
        serialize: (data) => JSON.stringify(data),
        deserialize: (data) => destr(data)  // destr是反序列化的库，优点很多，可以自行查看
    }

    // 从存储中恢复状态到store
    const hydrateStore = (store, context) => {
        const fromStorage = electronStore.getItem(store.$id)
        if (fromStorage) {
            const deserialized = serializer.deserialize(fromStorage)
            store.$patch(deserialized)
        }
    }

    // 将store的状态持久化到存储中
    const persistState = ({ storeId }, state) => {
        const toStorage = serializer.serialize(state)
        electronStore.setItem(storeId, toStorage)
    }

    // 创建持久化的功能
    const createPersistedState = (context) => {
        const {
            pinia,
            store,
            options: { persist = true }
        } = context

        // 如果不需要持久化，直接返回
        if (!persist) return
        
        // 将数据从存储中恢复状态到store
        hydrateStore(store, context)

        // 数据变化时，持久化store的状态
        store.$subscribe(
            (_mutation, state) => {
                persistState(_mutation, state)
            },
            { detached: true }
        )
    }

    export default createPersistedState
```

然后在Pinia的入口文件中使用

```js
import { createPinia } from 'pinia'
import createPersistedState from './plugin-persistence'

const store = createPinia()
store.use(createPersistedState)
```
--- 

随着业务复杂度提升，基础版本逐渐无法满足实际需求。  
所以，我们来添加新功能了！

### **功能升级清单**

1.  **存储键名自定义** - 告别固定命名的key
1.  **存储介质扩展** - 支持localStorage/sessionStorage/自定义存储
1.  **数据筛选能力** - 按需持久化特定状态字段
1.  **生命周期钩子** - 添加`beforeHydrate`和`afterHydrate`回调
1.  **错误处理机制** - 增加存储异常日志记录

## 需求分析：

首先我们看一下这些功能，不难发现，这些功能都是要求可以自定义的，那么就可以采用通过**配置项**的方式去完成。

在Pinia的官网介绍中提到，Pinia 插件是一个函数，它接收一个可选参数**context**，其中的参数options可以定义传给 `defineStore()` 的 store 的可选对象。  
在基础版中我们已经定义了一个options，即 `persist: true` ，用于判断是否需要持久化。因此在上面的功能中就可以根据具体的需求设置配置项来进行功能开发。

在配置项中，可以分为两种：**1、全局配置；2、局部配置。** 由于这两种配置可能会出现配置项的重复，因此在**优先级上我们设定局部配置大于全局配置。**

## 需求开发：

在基础版中，我们创建了一个函数 `createPersistedState` 并导出插件给`createPinia()`使用，在这里我们可以传递一些全局配置，例如：

``` js
const store = createPinia()
store.use(
    createPersistedState({
		key: (id) => id,
        storage: localStorage,
        debug: true
    })
)
```

因此我们需要修改函数 `createPersistedState` 来接收全局配置项

``` js
const createPersistedState = (config = {}) => {
    return (context) => {
        createPersisted(context, config)
    }
}

const createPersisted = (context, config) => {
    // to do ...
}
```

## **一、存储键名自定义** - 告别固定命名的key

分析一下：  
在自定义key的设置中，我们既可以配置全局的key，也可以针对各个模块设置key。

### 局部配置key：

``` js
// --- store/userStore.js ---
const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        name: ''
    }),
    persist: {
        key: 'my-user'
    }
})

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    // 如果不需要持久化，直接返回
    if (!persist) return
    
    // 定义一个配置项，判断persist中key是否存在，不存在则使用默认
    const persistenceOptions = {
        key: persist.key ?? store.$id
    }
    
    // 将数据从存储中恢复状态到store
    hydrateStore(store, persistenceOptions, context)

    // 数据变化时，持久化store的状态
    store.$subscribe(
        (_mutation, state) => {
            persistState(state, persistenceOptions)
        },
        { detached: true }
    )
}
// 从存储中恢复状态到store
const hydrateStore = (store, persist, context) => {
    const { key } = persist // 将key结构出来后使用
    const fromStorage = localstorage.getItem(key)
    // ...
}

// 将store的状态持久化到存储中
const persistState = (state, persist) => {
    const { key } = persist
    // 将key结构出来后使用
    localstorage.setItem(key, toStorage)
}
```

### **全局配置key：**

由于pinia中支持分模块，比如我们有userStore、shopStore两个模块，那么**在配置全局key时，如果直接设置字符串，会导致两个模块存储数据的key值重复导致数据覆盖**。因此我们在配置全局key时只能对模块设置的key进行扩展和补充。

``` js
// --- store/index.js ---
const store = createPinia()
store.use(
    createPersistedState({
        // 配置全局的key，传入一个函数并接受一个参数，用来做扩展，比如加前缀
        key: (id) => `_persisted_${id}`
    })
)

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    
    // 定义一个配置项，判断全局的key是否存在且为函数，执行函数后返回对应的字符串。
    const persistenceOptions = {
        key: (config.key && typeof config.key === "function" ? config.key : (x) => x)(p.key ?? store.$id)
    }
    
    // ...
}
```

## **二、存储介质扩展** - 支持localStorage/sessionStorage/自定义存储

### 局部配置：

``` js
// --- store/userStore.js ---
const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        name: ''
    }),
    persist: {
        key: 'my-user',
        storage: sessionstorage
    }
})

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    if (!persist) return
    
    // 配置项中接收storage
    const persistenceOptions = {
        key: persist.key ?? store.$id,
        // 将定义的storage传入
        storage: persist.storage ?? window.localstorage
    }
    // ...
}
// 从存储中恢复状态到store
const hydrateStore = (store, persist, context) => {
    const { key, storage } = persist // 将storage解构出来
    // 修改
    const fromStorage = storage.getItem(key)
    // ...
}

// 将store的状态持久化到存储中
const persistState = (state, persist) => {
    const { key, storage } = persist   // 将storage解构出来后使用
    
    // 修改
    storage.setItem(key, toStorage)
}
```

### 全局配置：

如果嫌麻烦我们可以在全局进行配置storage，如果在模块中也配置了storage，那按照规则局部配置大于全局配置。

``` js
// --- store/index.js ---
const store = createPinia()
store.use(
    createPersistedState({
        storage: localStorage  // 配置storage
    })
)

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    if (!persist) return
    
    // 配置项中接收storage
    const persistenceOptions = {
        key: persist.key ?? store.$id,
        // 只需要在配置项中配置全局配置的storage即可。
        storage: persist.storage ?? config.storage ?? window.localstorage
    }
}
```

## 三、**数据筛选能力** - 按需持久化特定状态字段

使用deep-pick-omit库，用来**深度选择（pick）或排除（omit）嵌套对象的属性**。

``` js
// --- store/userStore.js ---
const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        name: 'Tony',
        a: { b: "B" },
	      c: { d: 'D' }
    }),
    persist: {
        key: 'my-user',
        storage: sessionstorage,
        pick: ['name', 'a', 'c.d'], // pick表示数组中的进行存储
        omit: ['a.b'], // omit 表示数组中的不存储，其他的进行存储
    }
})

// --- store/plugin-pinia-persistence.js ---
// 引入deep-pick-omit
import { deepOmitUnsafe, deepPickUnsafe } from 'deep-pick-omit'
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    if (!persist) return
    
    // 配置项中接收storage
    const persistenceOptions = {
        key: persist.key ?? store.$id,
        storage: persist.storage ?? config.storage ?? window.localstorage,
        pick: persist.pick, // 传入配置
        omit: persist.omit // 传入配置
    }
    // ...
}

// 从存储中恢复状态到store
const hydrateStore = (store, persist, context) => {
    const { key, storage, pick, omit } = persist // 将pick, omit解构出来
    // 修改
    const fromStorage = storage.getItem(key)
    if (fromStorage) {
        // 反序列化，解析出数据
        const deserialized = serializer.deserialize(fromStorage)
        // 筛选出哪些是需要存储的
        const picked = pick ? deepPickUnsafe(deserialized, pick) : deserialized
        // 排除出去不需要存储的
        const omitted = omit ? deepOmitUnsafe(picked, omit) : picked
        store.$patch(omitted)
    }
    // ...
}

// 将store的状态持久化到存储中
const persistState = (state, persist) => {
    const { key, storage, pick, omit } = persist   // 将pick, omit解构出来后使用
    
    // 筛选出哪些是需要存储的
    const picked = pick ? deepPickUnsafe(state, pick) : state
    // 排除出去不需要存储的
    const omitted = omit ? deepOmitUnsafe(picked, omit) : picked
    // 序列化数据
    const toStorage = serializer.serialize(omitted)
    storage.setItem(key, toStorage)
}
```

这样就实现了数据的选择性存储，如果我们有这样一个需求，比如name字段需要存到localstorage中，token需要存在sessionStorage中，该怎么处理？

``` js
// --- store/userStore.js ---
const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        name: 'Tony',
        token: '123123123'
    }),
    persist: [  // 将结构改为数组的形式
        {
          pick: ['name']
          storage: localstorage
        },{
          pick: ['token']
          storage: sessionstorage
        }
    ]
})

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    if (!persist) return
    
    // 由于要适配数组，所以如果不是数组的话要转化成数组的形式
    const persistenceOptions = Array.isArray(persist) ? persist : persist === true ? [{}] : [persist]
													    
    // 进行遍历处理配置项
    const persistences = persistenceOptions.map((p) => {
        return {
            key: (config.key && typeof config.key === "function" ? config.key : (x) => x)(p.key ?? store.$id),
            storage: p.storage ?? config.storage ?? window.localStorage,
            pick: p.pick,
            omit: p.omit
        }
    })
    
    // 循环调用
    persistences.forEach((persist) => {
        // 将数据从存储中恢复状态到store
        hydrateStore(store, persist, context)

        // 数据变化时，持久化store的状态
        store.$subscribe(
            (_mutation, state) => {
                persistState(state, persist)
            },
            { detached: true }
        )
    })
}
```

## **四、生命周期钩子 + 错误处理机制**
 
``` js
// --- store/userStore.js ---
const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        name: 'Tony'
    }),
    persist: {
        key: 'my-user',
        storage: sessionstorage,
        pick: [],
        omit: [],
        beforeHydrate: (ctx) => {}, 
        afterHydrate: (ctx) => {}, 
        debug: true
    }
})

// --- store/plugin-pinia-persistence.js ---
const createPersisted = (context, config) => {
    const { store, options: { persist = true }} = context
    if (!persist) return
		
    // ...

    const persistences = persistenceOptions.map((p) => {
        return {
            key: (config.key && typeof config.key === "function" ? config.key : (x) => x)(p.key ?? store.$id),
            storage: p.storage ?? config.storage ?? window.localStorage,
            pick: p.pick,
            omit: p.omit,
            beforeHydrate: p.beforeHydrate, // 配置钩子函数
            afterHydrate: p.afterHydrate // 配置钩子函数
            debug: p.debug ?? config.debug ?? false // 配置debug
        }
    })
    
    // ...
}
// 从存储中恢复状态到store
const hydrateStore = (store, persist, context) => {
    const { key, storage, pick, omit, beforeHydrate, afterHydrate, debug } = persist

    try {
        // 钩子函数在用持久化数据激活 store state 之前运行
        beforeHydrate?.(context)

        // ...

        // 钩子函数在用持久化数据激活 store state 之后运行
        afterHydrate?.(context)
    } catch (error) {
        // 如果debug配置了，则使用console.error捕获错误
        if (debug) {
            console.error('持久化错误' + error)
        }
    }
}

// 将store的状态持久化到存储中
const persistState = (state, persist) => {
    const { key, storage, pick, omit, beforeHydrate, afterHydrate, debug } = persist
    try {
        // ...
    } catch (err) {
        if (debug) {
            console.error('保存错误' + err)
        }
    }
}
```

至此，plugin-pinia-persistence的大部分功能已经实现了，我再官网上看了看应该还缺少**强制 hydration、强制持久化**，应该就是将 `hydrateStore` 和 `persistState` 方法挂载到store上，然后就可以调用了。

希望本文对你了解Pinia以及如何写一个plugin有所帮助。