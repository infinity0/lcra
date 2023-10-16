let lcraResultsCache = {};

function basicTranslate(srcId, dstId, start, extract, proxies) {
  document.addEventListener("DOMContentLoaded", () => {
    let src = document.getElementById(srcId);
    let dst = document.getElementById(dstId);
    let errorMessage = `没翻译好，请<a id="retry" href="javascript:void(0)">重试</a>。`;
    let pendingTO;
    let pendingWord;

    function lcraTranslate(intv) {
      if (pendingTO) {
        //console.log("clear:", currentWord);
        clearTimeout(pendingTO);
      }

      let localWord = src.innerText;
      pendingTO = setTimeout(async () => {
        if (!(localWord in lcraResultsCache)) {
          let status = `正在翻译： ${localWord} ……`;
          dst.innerText = status;
          pendingWord = localWord;

          let res, err;
          for (let proxy of proxies) {
            try {
              res = await start(localWord, proxy);
              err = null;
              break;
            } catch (e) {
              err = e;
              console.error(e);
              continue;
            }
          };
          if (res) {
            lcraResultsCache[localWord] = res;
          }
          if (pendingWord != localWord) {
            // something else was typed in the meantime
            return;
          }
          if (err) {
            dst.innerHTML = `${errorMessage}<br/><span class="error">${err}</span>`;
            document.getElementById("retry").addEventListener("click", () => {
              lcraTranslate(1)
            });
            return;
          }
        }
        dst.innerText = extract(lcraResultsCache[localWord]);
        pendingWord = null;
      }, intv || 1000);
    }

    src.addEventListener("input", _ => lcraTranslate());
    window.addEventListener("hashchange", _ => {
      src.innerText = decodeURIComponent(document.location.hash.substring(1));
      lcraTranslate(1);
    });
    window.addEventListener("message", evt => {
      if (evt.data.hashchange) {
        document.location.hash = `#${evt.data.hashchange}`;
      }
    });
    src.innerText = decodeURIComponent(document.location.hash.substring(1));
    lcraTranslate(1);
  });
}