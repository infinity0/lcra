let storage = localStorage; // sessionStorage;
window.addEventListener("DOMContentLoaded", function() {

  let langs = ["en", "zh-Hans"];
  let lang = langs[0];
  let strings = {
    "confirm": {
      "en": "Are you sure?",
      "zh-Hans": "确定吗？",
    },
    "lang-code": {
      "en": "Enter language code, one of: ",
      "zh-Hans": "输入语言代码，其中之一：",
    },
    "select-article": {
      "en": "Please first select some word(s) in the article",
      "zh-Hans": "请先在文章里选择单词。",
    },
    "select-words": {
      "en": "Please select word(s) rather than a sentence or long fragment",
      "zh-Hans": "请选择单词而不是句子或长片段。",
    },
    "set-mobile": {
      "en": "Set this in your browser's Developer Tools. Some browsers require you to reload the page afterwards.",
    },
  };
  function S(k) {
    for (let l of [lang, ...langs]) {
      if (l in strings[k]) {
        return strings[k][l]
      }
    }
  }

  const zhtw = OpenCC.Converter({ from: 'cn', to: 'tw' });

  let article = document.getElementById("article");
  let artEdit = document.getElementById("article-edit");
  let help = document.getElementById("help");
  let setlang = document.getElementById("setlang");
  let wipe = document.getElementById("wipe");
  let vocab = document.getElementById("vocab");
  let references = document.getElementsByClassName("reference");
  let refselect = document.getElementById("refselect");
  let refurl = document.getElementById("refurl").querySelector("a");
  let refproxy = document.getElementById("reference-proxy");
  let refproxywarn = document.getElementById("reference-proxy-warn");
  let refmobile = document.getElementById("reference-mobile");

  function addWord(word) {
    let opt = document.createElement("option");
    if (typeof(word) == "object") {
      opt.value = word["zh-Hans"];
      opt.setAttribute("zh-Latn-pinyin", word["zh-Latn-pinyin"]);
      opt.setAttribute("en", word["en"]);
    } else {
      opt.value = word;
      opt.setAttribute("zh-Latn-pinyin", PinyinHelper.convertToPinyinString(word, '', PinyinFormat.WITH_TONE_MARK) + " ??");
      opt.setAttribute("en", "");
    }
    opt.selected = "selected";
    opt.appendChild(document.createTextNode(opt.value));
    vocab.appendChild(opt);
  }

  function getWords() {
    return Array.from(vocab.options).map(opt => {return {
      "zh-Hans": opt.value,
      "zh-Latn-pinyin": opt.getAttribute("zh-Latn-pinyin"),
      "en": opt.getAttribute("en")
    }});
  }

  function makeUrl(el, word) {
    let url = el.getAttribute("url");
    return url.replace(/XX/, encodeURIComponent(word)).replace(/TT/, encodeURIComponent(zhtw(word)));
  }

  function storageGetBool(key, def) {
    switch (storage.getItem(key)) {
      case "0": return false;
      case "1": return true;
      default: return def;
    }
  }

  function loadLang(attr, f) {
    for (let el of document.querySelectorAll("*[" + attr + "]")) {
      for (let l of [lang, ...langs]) {
        if (el.hasAttribute(attr + "-" + l)) {
          f(el, el.getAttribute(attr + "-" + l));
          break;
        }
      }
    }
  }

  function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
  }

  function selectDefaultLanguage(candidates) {
    for (let l of candidates) {
      if (!l) continue;
      let la = l.split(/-/)[0];
      let lb = langs.find((l2) => l2.split(/-/)[0] == la);
      if (lb !== undefined) {
        return lb;
      }
    }
    return langs[0];
  }

  function loadUI() {
    lang = storage.getItem("lcra-lang") || selectDefaultLanguage([getQueryVariable("lang"), ...navigator.languages]);
    vocab.replaceChildren([]);
    for (let word of JSON.parse(storage.getItem("lcra-vocab") || "[]")) {
      addWord(word);
    }
    article.value = storage.getItem("lcra-article");
    article.disabled = storageGetBool("lcra-article-edit", true)? "": "disabled";
    // purpleculture, our default reference, needs proxy on non-mobile to work
    refproxy.checked = storageGetBool("lcra-reference-proxy", !detectMobile());
    refselect.value = storage.getItem("lcra-reference") || "purpleculture";
    loadLang("content", (el, v) => { el.innerText = v; });
    loadLang("title", (el, v) => { el.title = v; });
    loadLang("placeholder", (el, v) => { el.setAttribute("placeholder", v); });
    autoResizeVocab();
  }

  function saveUI() {
    storage.setItem("lcra-lang", lang);
    storage.setItem("lcra-vocab", JSON.stringify(getWords()));
    storage.setItem("lcra-article", article.value);
    storage.setItem("lcra-article-edit", (article.disabled)? "0": "1");
    storage.setItem("lcra-reference-proxy", (refproxy.checked)? "1": "0");
    storage.setItem("lcra-reference", refselect.value);
  }

  function loadReferencesFromUI(reload) {
    let word = vocab.value;

    for (let el of document.querySelectorAll("iframe[is=x-frame-bypass]")) {
      el.proxyEnabled = refproxy.checked;
    }
    for (let el of references) {
      if (reload === true && el.clearSrc) {
        el.clearSrc();
      }
      let url = makeUrl(el, word);
      let i = url.indexOf("#");
      if (i < 0 || reload !== true) {
        el.src = url;
      } else {
        // browsers don't reload #-URLs in iframes properly, we force it here
        el.src = url.substring(0, i);
        let f = () => {
          el.src = url;
          el.removeEventListener("load", f);
        };
        el.addEventListener("load", f);
      }
      el.style.display = "none";
    }
    if (refselect.value && vocab.selectedOptions.length) {
      let el = document.getElementById(refselect.value);
      el.style.display = "block";
      refurl.href = makeUrl(el, word);
      refurl.firstChild.innerText = refselect.selectedOptions[0].innerText.split("[")[0].replace(/ *$/g,"") + " - " + word;
      refurl.style.display = "block";
    } else {
      refurl.href = "";
      refurl.firstChild.innerText = "";
      refurl.style.display = "none";
    }
  }

  article.addEventListener("input", saveUI, false);
  artEdit.addEventListener("click", () => {
    article.disabled = (article.disabled)? "": "disabled";
    saveUI();
  });
  let artImport = document.getElementById("article-import");
  let artFile = document.getElementById("article-file");
  artImport.addEventListener("click", () => {
    artFile.showPicker();
  });
  artFile.addEventListener("change", () => {
    const reader = new FileReader();
    reader.onload = (e) => {
      article.value = e.target.result;
      saveUI();
    };
    for (let file of artFile.files) {
      reader.readAsText(file)
    }
  });
  help.addEventListener("click", () => {
    window.alert(article.placeholder);
  });
  setlang.addEventListener("click", () => {
    let v = window.prompt(S("lang-code") + langs, lang);
    if (langs.includes(v)) {
      storage.setItem("lcra-lang", v);
      loadUI();
      loadReferencesFromUI();
    }
  });
  wipe.addEventListener("click", () => {
    if (window.confirm(wipe.title + " - " + S("confirm"))) {
      storage.clear();
      loadUI();
      loadReferencesFromUI();
    }
  });

  vocab.addEventListener("change", () => {
    /**if (window.find && vocab.selectedOptions.length) {
      // note: this works but destroys the existing selectionRange in #article
      // it also shifts focus away from the vocab list
      let w = vocab.selectedOptions[0].value;
      window.find("window.find reset hack", false, true, true, false, false);
      window.find(w, false, false, true, false, false);
    }*/
    loadWordFromUI();
    loadReferencesFromUI();
  });

  let addword = document.getElementById("addword");
  addword.addEventListener("click", () => {
    let selection = article.value.substring(article.selectionStart, article.selectionEnd);
    if (selection.length == 0) {
      window.alert(S("select-article"));
      return;
    }
    // split on punctuation and whitespace
    let words = selection.split(/[\p{P}\p{S}\s]+/gu);
    for (let w of words) {
      if (w.length > 4) {
        window.alert(S("select-words"));
        return;
      }
    }
    for (let w of words) {
      // empty string is not a word
      if (w.length == 0) {
        continue;
      }
      // if word is already in the vocab, select it but don't add a new one
      let found = false;
      for (let o of vocab.options) {
        if (w == o.value) {
          o.selected = "selected";
          found = true;
          break;
        }
      }
      // only add the word if it was not already there
      if (!found) {
        addWord(w);
      }
    }
    saveUI();
    loadWordFromUI();
    loadReferencesFromUI();
  });
  let copyword = document.getElementById("copyword");
  copyword.addEventListener("click", () => {
    for (let o of vocab.selectedOptions) {
      navigator.clipboard.writeText(o.value);
    }
  });
  let delword = document.getElementById("delword");
  delword.addEventListener("click", () => {
    for (let o of vocab.selectedOptions) {
      o.remove();
    }
    if (vocab.options.length) {
      vocab.options[vocab.options.length-1].selected = "selected";
    }
    saveUI();
    loadWordFromUI();
    loadReferencesFromUI();
  });

  function exportVocab(contents, type) {
    let blob = new Blob(contents, {type});

    // https://www.stefanjudis.com/snippets/how-trigger-file-downloads-with-javascript/
    // Create a link and set the URL using `createObjectURL`
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = URL.createObjectURL(blob);
    link.download = "chinese-vocab";

    // It needs to be added to the DOM so it can be clicked
    document.body.appendChild(link);
    link.click();

    // To make this work on Firefox we need to wait
    // a little while before removing it.
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.parentNode.removeChild(link);
    }, 0);
  }

  function csvEscape(text) {
    if (text.indexOf(",") < 0) {
      return text;
    } else {
      return '"' + text.replace('"', '""') + '"';
    }
  }

  let exportJson = document.getElementById("vocab-export-json");
  exportJson.addEventListener("click", () => {
    let contents = JSON.parse(storage.getItem("lcra-vocab") || "[]");
    exportVocab([JSON.stringify(contents, null, 1)], "application/json");
  });
  let exportCsv = document.getElementById("vocab-export-csv");
  exportCsv.addEventListener("click", () => {
    let keys = "zh-Hans,zh-Latn-pinyin,en".split(",");
    let contents = JSON.parse(storage.getItem("lcra-vocab") || "[]");
    let lines = contents.map(opt => keys.map(k => csvEscape(opt[k])).join(",") + "\n");
    // https://docs.ankiweb.net/importing/text-files.html#file-headers
    // https://www.w3.org/International/questions/qa-choosing-language-tags
    lines.unshift("#notetype:Basic " + keys[0] + ": " + keys.slice(1).join(", ") + "\n");
    lines.unshift("#columns:" + keys + "\n");
    lines.unshift("#separator:Comma\n");
    exportVocab(lines, "text/csv");
  });

  let wordpy = document.getElementById("word-zh-Latn-pinyin");
  let worden = document.getElementById("word-en");
  function loadWordFromUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      wordpy.value = opt.getAttribute("zh-Latn-pinyin");
      worden.value = opt.getAttribute("en");
    } else {
      wordpy.value = ""
      worden.value = ""
    }
  }
  function saveWordIntoUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      opt.setAttribute("zh-Latn-pinyin", wordpy.value);
      opt.setAttribute("en", worden.value);
    }
  }
  wordpy.addEventListener("input", () => {
    saveWordIntoUI();
    saveUI();
  }, false);
  worden.addEventListener("input", () => {
    saveWordIntoUI();
    saveUI();
  }, false);

  refselect.addEventListener("change", () => {
    saveUI();
    loadReferencesFromUI();
  });
  refproxy.addEventListener("change", () => {
    saveUI();
    loadReferencesFromUI(true);
  });
  refproxywarn.addEventListener("click", () => {
    window.alert(refproxywarn.title);
  });
  refmobile.parentNode.addEventListener("click", (e) => {
    window.alert(S("set-mobile"));
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // experimental anti-frame-busting code for Google Translate / Baidu Translate
  // it doesn't appear to work unfortunately
  /*let killBust = 0;
  document.getElementById("baidu").addEventListener("beforeunload", () => {
    killBust++;
  });
  setInterval(() => {
    if (killBust > 0) {
      killBust -= 2;
      window.top.location = "https://pdeb1/204";
      console.log("request 204d");
    }
  }, 1);*/

  function detectMobile() {
    if (navigator.userAgent.search(/\b(iphone|ipad|ipod|webos|android|mobile|phone)\b/i) >= 0) {
      // some tablets have UAD.mobile false even though they're running an Android browser
      return true;
    } else if (navigator.userAgentData) {
      return navigator.userAgentData.mobile;
    } else {
      return false;
    }
  }
  setInterval(() => {
    if (refmobile.checked != detectMobile()) {
      refmobile.checked = detectMobile();
      loadReferencesFromUI(true);
    }
    refproxywarn.style.display = (refmobile.checked && refproxy.checked)? "inline": "none";
  }, 4);

  function autoResizeVocab() {
    let ol = vocab.options.length;
    if (ol == 0) {
      // if the vocab is empty then some browsers don't calculate the heights properly
      // due to Chinese characters having different heights from default ones
      addWord("虚设");
    }
    vocab.size = 1;
    let oh = vocab.offsetHeight;
    let h = histctl.offsetHeight;
    for (let i = 0; i < 128; i++) {
      vocab.size++;
      if (vocab.offsetHeight == oh) {
        // some browsers don't support resizing a <select>
        break;
      }
      if (histctl.offsetHeight > h) {
        let s = vocab.size - 1;
        vocab.size = 1;
        // give the browser some time to remove the scrollbars
        setTimeout(() => { vocab.size = s; }, 1);
        break;
      }
    }
    if (ol == 0) {
      vocab.replaceChildren([]);
    }
  }
  let resizeTO = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(autoResizeVocab, 125);
  });

  loadUI();
  loadWordFromUI();
  loadReferencesFromUI();
});
