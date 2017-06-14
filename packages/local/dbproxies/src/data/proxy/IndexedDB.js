Ext.define('DBProxies.data.proxy.IndexedDB', {
    alias: 'proxy.indexeddb',
    extend: 'DBProxies.data.proxy.Db',
    
    isIndexedDBProxy: true,

    config: {
        cloud: false,
        implicitFields: false
    }

});
