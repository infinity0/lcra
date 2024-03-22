// adapted from https://niutech.github.io/x-frame-bypass/x-frame-bypass.js
customElements.define('x-frame-bypass', class extends HTMLIFrameElement {
  static observedAttributes = ['src'];
  constructor () {
    super()
  }
  proxies = [];
  clearSrc () {
    this.removeAttribute("src");
    delete this.src;
    this.removeAttribute("srcdoc");
    delete this.srcdoc;
  }
  async attributeChangedCallback (e) {
    if (this.proxies.length && this.src) {
      let useproxy = eval(this.getAttribute("use-proxy-if"));
      if (useproxy) {
        this.loadProxy(this.src, {
          headers: {
            "X-Cors-Headers": this.getAttribute("cors-headers") || "{}",
          }
        })
      } // otherwise normal iframe loading behaviour
    }
  }
  connectedCallback () {
    this.sandbox = '' + this.sandbox || 'allow-forms allow-modals allow-scripts allow-same-origin'
  }
  async loadProxy (url, options) {
    if (!url || !url.startsWith('http'))
      throw new Error(`X-Frame-Bypass src ${url} does not start with http(s)://`)
    let origin = new URL(url).origin;
    this.srcdoc = `<html>
<head>
  <style>
  .loader {
    position: absolute;
    top: calc(50% - 25px);
    left: calc(50% - 25px);
    width: 50px;
    height: 50px;
    background-color: #333;
    border-radius: 50%;
    animation: loader 1s infinite ease-in-out;
  }
  @keyframes loader {
    0% {
    transform: scale(0);
    }
    100% {
    transform: scale(1);
    opacity: 0;
    }
  }
  </style>
</head>
<body>
  <div class="loader"></div>
</body>
</html>`
    try {
      let [proxy, resp] = await this.fetchProxy(url, options);
      let srcx = eval(`(${this.getAttribute("src-transform") || "x => x"})`);
      let data = await resp.text();
      if (data)
        this.srcdoc = srcx(data).replace(/<head([^>]*)>/i, `<head$1>
  <base href="${url}">
  <script>
  // Proxy XMLHttpRequest as well
  (function(xhr) {
    var open = xhr.open;
    xhr.open = function(method, url, async) {
      if (url.startsWith("${origin}")) {
        url = "${proxy}" + url;
      } else if (url.startsWith("/")) {
        url = "${proxy}" + "${origin}" + url;
      }
      console.debug("X-Frame-Bypass intercepted XMLHttpRequest.open", arguments);
      return open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype);

  // X-Frame-Bypass navigation event handlers
  document.addEventListener('click', e => {
    if (window.frameElement && document.activeElement && document.activeElement.href) {
      e.preventDefault()
      console.debug("X-Frame-Bypass intercepted click", e);
      window.frameElement.loadProxy(document.activeElement.href)
    }
  })
  document.addEventListener('submit', e => {
    if (window.frameElement && document.activeElement && document.activeElement.form && document.activeElement.form.action) {
      e.preventDefault()
      console.debug("X-Frame-Bypass intercepted submit", e);
      if (document.activeElement.form.method === 'post')
        window.frameElement.loadProxy(document.activeElement.form.action, {method: 'post', body: new FormData(document.activeElement.form)})
      else
        window.frameElement.loadProxy(document.activeElement.form.action + '?' + new URLSearchParams(new FormData(document.activeElement.form)))
    }
  })

  // Scroll #-URLs properly into view.
  let url = "${url}";
  let i = url.indexOf("#");
  if (i >= 0) {
    let hash = decodeURIComponent(url.substring(i + 1));
    let scrollHash = function (e) {
      let cands = [
        document.getElementById(hash),
        document.querySelector(hash),
      ];
      while (cands.length) {
        let el = cands.pop();
        if (!el) continue;
        if (el.offsetParent === null) {
          console.debug("element is being hidden, retrying scroll soon...");
          window.setTimeout(scroll, 500);
        } else {
          window.scrollTo(0, el.offsetTop - 1); // -1 to avoid any sticky bars
          console.debug("X-Frame-Bypass scrolled to", hash, e);
        }
        return;
      }
      console.debug("X-Frame-Bypass could not find element:", hash);
    };
    document.addEventListener('DOMContentLoaded', scrollHash);
    window.addEventListener('load', scrollHash);
  }
  </script>`);
    } catch (e) {
      console.error('Cannot load X-Frame-Bypass:', e)
      this.srcdoc = `<html>
<head>
  <style>
  @media (prefers-color-scheme: light) {
    body {
      background-color: white;
      color: black;
    }
  }
  @media (prefers-color-scheme: dark) {
    body {
      background-color: black;
      color: white;
    }
  }
  html, body {
    width: 100%;
    height: 100%;
    positive: relative;
    margin: 0;
    padding: 0;
  }
  .error {
    position: absolute;
    top: 50%;
    margin: 0 0.5em;
    transform: translateY(calc(-50% - 80px));
    h1 { font-size: 40px; }
  }
  </style>
</head>
<body>
  <div class="error">
  <h1>X-Frame-Bypass loading failed</h1>
  <p>Depending on the error message below, we may have been temporarily blocked by the reference provider. You can try switching UI (between desktop vs mobile), try another reference, or try again later.</p>
  <pre>${e}</pre>
  </div>
</body>
</html>`
    }
  }
  async fetchProxy (url, options) {
    const proxies = (options || {}).proxies || this.proxies;
    let e;
    for (let proxy of proxies) {
      console.log('X-Frame-Bypass loading:', url, 'via', proxy, 'with options', options);
      let res = await fetch(proxy + url, options);
      if (!res.ok) {
        e = new Error(`${res.status} ${res.statusText}`);
        continue;
      } else {
        return [proxy, res];
      }
    }
    throw e;
  }
}, {extends: 'iframe'})
