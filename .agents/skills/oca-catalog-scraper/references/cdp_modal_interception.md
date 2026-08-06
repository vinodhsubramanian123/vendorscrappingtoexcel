# CDP Remote Debugging & WebLogic Modal Interception Reference

## 1. Remote Debugging Target Resolution

Connecting to the active Chrome instance on port 9222:

```javascript
const { getOCATarget, connectWS } = require('./scripts/lib/cdp');

const target = await getOCATarget(9222);
const ws = await connectWS(target.webSocketDebuggerUrl);
```

---

## 2. Dialog & Session Extension Immunity

### WebLogic JS Dialog Auto-Accept
```javascript
// Listens for window.alert / confirm / prompt
ws.send('Page.enable');
ws.on('Page.javascriptDialogOpening', (params) => {
  ws.send('Page.handleJavaScriptDialog', { accept: true });
});
```

### DOM Session Extension Modal Dismissal
```javascript
async function dismissDOMModals(ws) {
  const code = `
    (() => {
      const btns = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
      const stayLoggedIn = btns.find(b => /continue session|stay logged in|proceed|continue|ok/i.test(b.innerText || b.value));
      if (stayLoggedIn) { stayLoggedIn.click(); return true; }
      return false;
    })();
  `;
  return await evalCode(ws, code);
}
```
