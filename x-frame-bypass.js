// adapted from https://niutech.github.io/x-frame-bypass/x-frame-bypass.js
customElements.define('x-frame-bypass', class extends HTMLIFrameElement {
  static get observedAttributes() {
    return ['src']
  }
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
      this.load(this.src, {
        headers: {
          "X-Cors-Headers": this.getAttribute("cors-headers") || "{}",
        }
      })
    }
  }
  connectedCallback () {
    this.sandbox = '' + this.sandbox || 'allow-forms allow-modals allow-scripts allow-same-origin'
  }
  async load (url, options) {
    if (!url || !url.startsWith('http'))
      throw new Error(`X-Frame-Bypass src ${url} does not start with http(s)://`)
    console.log('X-Frame-Bypass loading:', url, options);
    let origin = new URL(url).origin;
    let srcx = eval(`(${this.getAttribute("src-transform") || "x => x"})`);
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
      let [proxy, resp] = await this.fetchProxy(url, options, 0);
      let data = await resp.text();
      if (data)
        this.srcdoc = srcx(data.replace(/<head([^>]*)>/i, `<head$1>
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
      //console.log("intercepted XMLHttpRequest.open", arguments);
      return open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype);

  // X-Frame-Bypass navigation event handlers
  document.addEventListener('click', e => {
    if (frameElement && document.activeElement && document.activeElement.href) {
      e.preventDefault()
      frameElement.load(document.activeElement.href)
    }
  })
  document.addEventListener('submit', e => {
    if (frameElement && document.activeElement && document.activeElement.form && document.activeElement.form.action) {
      e.preventDefault()
      if (document.activeElement.form.method === 'post')
        frameElement.load(document.activeElement.form.action, {method: 'post', body: new FormData(document.activeElement.form)})
      else
        frameElement.load(document.activeElement.form.action + '?' + new URLSearchParams(new FormData(document.activeElement.form)))
    }
  })

  // Scroll #-URLs properly into view.
  document.addEventListener('DOMContentLoaded', e => {
    let url = "${url}";
    let i = url.indexOf("#");
    if (i >= 0) {
      let hash = url.substring(i + 1);
      let el = document.getElementById(hash);
      if (el) el.scrollIntoView();
    }
  })
  </script>`));
    } catch (e) {
      console.error('Cannot load X-Frame-Bypass:', e)
    }
  }
  async fetchProxy (url, options) {
    const proxies = (options || {}).proxies || this.proxies;
    let e;
    for (let proxy of proxies) {
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
