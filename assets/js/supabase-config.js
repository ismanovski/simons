window.SB_SUPABASE_CONFIG = {
  url: 'https://kkgzufieaffuxqpykcyl.supabase.co',
  anonKey: 'sb_publishable_l_dl8Os5eV0-szrud11Vyg_Rxce-7jU'
};

(function(){
  function isConfigured(config) {
    if (!config || !config.url || !config.anonKey) return false;
    return !config.url.includes('YOUR_PROJECT_REF') && !config.anonKey.includes('YOUR_SUPABASE_ANON_KEY');
  }

  window.SB_SUPABASE = {
    get config() {
      return window.SB_SUPABASE_CONFIG || {};
    },
    isConfigured() {
      return isConfigured(this.config);
    },
    createClient() {
      if (!window.supabase?.createClient || !this.isConfigured()) return null;
      return window.supabase.createClient(this.config.url, this.config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
  };
})();
