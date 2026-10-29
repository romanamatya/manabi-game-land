// Early input barrier. Public configuration must be confirmed by the server.
(()=>{if(!window.MANABI_ENV?.preview||window.MANABI_BACKEND_CONFIG?.managementEnabled!==true)return;
 const game=location.pathname.includes('/games/');window.ManabiGameAllowed=!game;
 if(game)document.documentElement.style.visibility='hidden';
 for(const type of ['click','pointerdown','keydown'])document.addEventListener(type,e=>{if(game&&!window.ManabiGameAllowed&&!e.target.closest?.('#managementGate')){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.ManabiManagementReady=import('./management-runtime.js?v=e58f88243579').then(m=>m.start());
 window.ManabiManagementReady.catch(()=>{});
})();
