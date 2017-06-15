Ext.define('DBProxies.overrides.ext.data.Model', {
    override: 'Ext.data.Model',
    
    inheritableStatics: {

        getProxy: function() {
            
            var me = this,
                proxy = me.proxy,
                defaultProxy = me.defaultProxy,
                defaults;

            if (!proxy) {
                // Check what was defined by the class (via onClassExtended):
                proxy = me.proxyConfig;

                if (!proxy && defaultProxy) {
                    proxy = defaultProxy;
                }

                if (!proxy || !proxy.isProxy) {
                    if (typeof proxy === 'string') {
                        proxy = {
                            type: proxy
                        };
                    }
                    
                    if (proxy && proxy.type === 'dynamic') {
                        proxy = DBProxies.data.proxy.Dynamic.applyDynamicProxy(proxy);
                    }
                    
                    // We have nothing or a config for the proxy. Get some defaults from
                    // the Schema and smash anything we've provided over the top.
                    defaults = me.schema.constructProxy(me);
                    proxy = proxy ? Ext.merge(defaults, proxy) : defaults;
                }

                proxy = me.setProxy(proxy);
            }

            return proxy;
        }
        
    }

});
