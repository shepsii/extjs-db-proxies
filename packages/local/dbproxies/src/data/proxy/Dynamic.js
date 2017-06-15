/**
 * Mock class used to define docs/configs for dynamic proxies
 * @private
 */
Ext.define('DBProxies.data.proxy.Dynamic', {
    extend: 'Ext.data.proxy.Proxy',

    config: {
        /**
         * @cfg {Object} allConfig
         * Config to apply to whichever proxy is dynamically chosen
         */
        allConfig: {},

        /**
         * @cfg {Array} proxies
         * Array of proxy definitions to try. Each must comply with Ext.data.Model.proxy config. Configs defined here
         * override those defined in allConfig
         */
        proxies: []
    },
    
    statics: {
        applyDynamicProxy: function(dynamicProxy) {
            var allConfig = dynamicProxy.allConfig || {},
                proxies = dynamicProxy.proxies || [],
                ln = proxies.length,
                i,
                proxyCls,
                types = [],
                proxy;

            for (i = 0; i < ln; i += 1) {
                proxy = proxies[i];
                if (typeof proxy === 'string') {
                    proxy = {
                        type: proxy
                    };
                }
                proxyCls = Ext.ClassManager.getByAlias('proxy.' + proxy.type);
                types.push(proxy.type);
                if (!proxyCls) {
                    console.warn('Dynamic proxy: proxy type not defined (' + proxy.type + ')');
                    continue;
                }
                if (Ext.isFunction(proxyCls.isSupported) && !proxyCls.isSupported()) {
                    continue;
                }
                return Ext.applyIf(proxy, allConfig);
            }

            console.warn('Dynamic proxy: no supported proxies found: tried ' + types.join(', '));
            return false;
        }
    }
    
});
