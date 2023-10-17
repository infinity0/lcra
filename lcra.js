let lcra_storage = localStorage; // sessionStorage;

function lcra_storageGetBool(key, def) {
  switch (lcra_storage.getItem(key)) {
    case "0": return false;
    case "1": return true;
    default: return def;
  }
}

let searchParams = new URLSearchParams(document.location.search);

function lcra_detectMobile() {
  if (navigator.userAgent.search(/\b(iphone|ipad|ipod|webos|android|mobile|phone)\b/i) >= 0) {
    // some tablets have UAD.mobile false even though they're running an Android browser
    return true;
  } else if (navigator.userAgentData) {
    return navigator.userAgentData.mobile;
  } else {
    return false;
  }
}

function lcra_articleHide(reinit) {
  let article = document.getElementById("article");
  let initHide = searchParams.get("article-hide");
  let articleHide = (reinit && initHide !== undefined)? initHide == "true": lcra_storageGetBool("lcra-article-hide", false);
  article.style.display = articleHide? "none": "block";
  return articleHide;
}

window.addEventListener("DOMContentLoaded", function() {

  let langs = ["en", "zh-Hans"];
  let lang;
  let strings = {
    "confirm": {
      "en": "Are you sure?",
      "zh-Hans": "确定吗？",
    },
    "lang-code": {
      "en": "Enter language code, one of: ",
      "zh-Hans": "输入语言代码，其中之一：",
    },
    "article-unlocked": {
      "en": "Article is unlocked for editing. Click to lock.",
    },
    "article-locked": {
      "en": "Article is locked to prevent accidental edits. Click to edit.",
    },
    "open-url": {
      "en": "Enter the full URL to open",
    },
    "add-a-word": {
      "en": "First add (⊕) a word",
      "zh-Hans": "先添加（⊕）个单词",
    },
    "input-or-select": {
      "en": "Please input the word(s) to add, or select some in the article then try again.",
      "zh-Hans": "请输入要添加的单词，或者在文章里选择一些然后再重试。",
    },
    "confirm-long-word": {
      "en": "may not be a word. Really add?",
      "zh-Hans": "可能不是单词。真的添加？",
    },
    "refui-text": {
      "en": ["Desktop UI", "Mobile UI", "Auto UI (Desktop)", "Auto UI (Mobile)"],
    },
    "sample-anki-deck": {
      "en": "Also download a sample Anki deck for importing the CSV into?",
    },
    "sample-anki-deck-url": {
      "en": "To download it later, the URL to the deck is inside the CSV file.",
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
  let arthide = document.getElementById("article-hide");
  let artedit = document.getElementById("article-edit");
  let help = document.getElementById("help");
  let setlang = document.getElementById("setlang");
  let wipe = document.getElementById("wipe");
  let vocab = document.getElementById("vocab");
  let histctl = document.getElementById("histctl");
  let references = document.getElementsByClassName("reference");
  let refselect = document.getElementById("refselect");
  let refurl = document.getElementById("refurl").querySelector("a");
  let refui = document.getElementById("refui");

  function selectLanguage(candidates) {
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

  function selectOption(o) {
    o.selected = "selected";
    o.scrollIntoView();
  }

  function provisionalPinyin(word) {
    return PinyinHelper.convertToPinyinString(word, '', PinyinFormat.WITH_TONE_MARK) + "?";
  }

  function isNotExample(opt) {
    return !Array.from(opt.classList).includes("exword");
  }

  function addWord(word) {
    let opt = document.createElement("option");
    if (typeof(word) == "object") {
      opt.value = word["zh-Hans"];
      opt.setAttribute("zh-Latn-pinyin", word["zh-Latn-pinyin"]);
      opt.setAttribute("en", word["en"]);
    } else {
      opt.value = word;
      opt.setAttribute("zh-Latn-pinyin", provisionalPinyin(word));
      opt.setAttribute("en", "");
    }
    opt.appendChild(document.createTextNode(opt.value));
    vocab.appendChild(opt);
    selectOption(opt);
    return opt;
  }

  function getWords() {
    return Array.from(vocab.options).filter(isNotExample).map(opt => ({
      "zh-Hans": opt.value,
      "zh-Latn-pinyin": opt.getAttribute("zh-Latn-pinyin"),
      "en": opt.getAttribute("en")
    }));
  }

  let exampleWord;

  function loadAttr(attr, labels, f) {
    for (let el of document.querySelectorAll("*[" + attr + "]")) {
      for (let l of labels) {
        if (el.hasAttribute(attr + "-" + l)) {
          f(el, el.getAttribute(attr + "-" + l));
          break;
        }
      }
    }
  }

  function loadLang(attr, f) {
    loadAttr(attr, [lang, ...langs], f);
  }
  
  const REFUI_ICONS = ["💻︎", "📱︎", "💻︎*", "📱︎*"];

  function preloadRefUI() {
    switch (lcra_storage.getItem("lcra-reference-ui")) {
      case "desktop":
        return 0;
      case "mobile":
        return 1;
      default:
        return 2 + Number(lcra_detectMobile());
    }
  }

  function setRefUI(refui_idx) {
    refui.innerText = REFUI_ICONS[refui_idx];
    refui.nextElementSibling.innerText = S("refui-text")[refui_idx];
  }

  function loadUI(reinit, resize) {
    lang = selectLanguage([...(reinit? [searchParams.get("lang")]: []), lcra_storage.getItem("lcra-lang"), ...navigator.languages]);
    vocab.replaceChildren([]);
    for (let word of JSON.parse(lcra_storage.getItem("lcra-vocab") || "[]")) {
      addWord(word);
    }
    if (reinit) {
      exampleWord = searchParams.get("exword") || (vocab.options.length? null: {
        "zh-Hans": "例子",
        "zh-Latn-pinyin": "lìzi",
        "en": "example",
      });
    }
    if (exampleWord) {
      let opt = addWord(exampleWord);
      opt.classList.add("exword");
      selectOption(opt);
    } else {
      let word = lcra_storage.getItem("lcra-vocab-selected");
      for (let opt of vocab.options) {
        if (opt.value == word) {
          selectOption(opt);
        }
      }
    }
    article.value = lcra_storage.getItem("lcra-article");
    article.disabled = lcra_storageGetBool("lcra-article-edit", true)? "": "disabled";
    arthide.innerText = lcra_articleHide(reinit)? "⇥": "⇤";
    artedit.innerText = lcra_storageGetBool("lcra-article-edit", true)? "✎": "🔒︎";
    artedit.title = lcra_storageGetBool("lcra-article-edit", true)? S("article-unlocked"): S("article-locked");
    setRefUI(preloadRefUI());
    refselect.value = lcra_storage.getItem("lcra-reference") || "purpleculture";
    loadLang("content", (el, v) => { el.innerText = v; });
    loadLang("title", (el, v) => { el.title = v; });
    loadLang("placeholder", (el, v) => { el.setAttribute("placeholder", v); });
    if (reinit || resize) {
      autoResizeVocab();
    }
  }

  function presaveRefUI() {
    switch (REFUI_ICONS.indexOf(refui.innerText)) {
      case 0: return "desktop";
      case 1: return "mobile";
      default: return "auto";
    }
  }

  function saveUI() {
    lcra_storage.setItem("lcra-lang", lang);
    lcra_storage.setItem("lcra-vocab", JSON.stringify(getWords()));
    for (let opt of vocab.selectedOptions) {
      if (isNotExample(opt)) {
        lcra_storage.setItem("lcra-vocab-selected", opt.value);
      }
    }
    lcra_storage.setItem("lcra-article", article.value);
    lcra_storage.setItem("lcra-article-hide", (article.style.display == "none")? "1": "0");
    lcra_storage.setItem("lcra-article-edit", (article.disabled)? "0": "1");
    lcra_storage.setItem("lcra-reference-ui", presaveRefUI());
    lcra_storage.setItem("lcra-reference", refselect.value);
  }

  function loadFrame(el, url, reload) {
    if (reload !== true && el.src == new URL(url, document.baseURI).href) {
      return;
    }
    if (reload === true && el.clearSrc) {
      el.clearSrc();
    }
    el.src = url;
  }

  function makeFrameUrl(urlpat, word) {
    return urlpat.replace(/XX/, encodeURIComponent(word)).replace(/TT/, encodeURIComponent(zhtw(word)));
  }

  function showFrameUrl(el, url, label) {
    url = url || "";
    label = label || ((url)? new URL(url).hostname: "");
    el.href = url;
    el.firstChild.innerText = label;
    el.style.display = (url)? "block": "none";
  }

  function loadReferencesFromUI(reload) {
    let word = vocab.value;

    let refui_ty = (REFUI_ICONS.indexOf(refui.innerText) & 1)? "mobile": "desktop";
    for (let a of ["cors-headers", "urlpat", "refurlpat", "use-proxy-if"]) {
      loadAttr(a, [refui_ty], (el, v) => { el.setAttribute(a, v); });
    }

    for (let el of references) {
      if ("proxies" in el) {
        let proxy = eval(el.getAttribute("use-proxy-if"));
        //console.log("proxy", el.id, proxy);
        el.proxies = proxy? lcraProxies(): [];
      }
      let urlpat = el.getAttribute("urlpat");
      // setting display: none prevents some browsers from scrolling to #-URLs
      el.style.visibility = (refselect.value == el.id)? "visible": "hidden";
      loadFrame(el, makeFrameUrl(urlpat, word), reload);
    }
    let url = "";
    let label = "";
    if (refselect.value && vocab.selectedOptions.length) {
      let el = document.getElementById(refselect.value);
      let urlpat = el.hasAttribute("refurlpat")? el.getAttribute("refurlpat"): el.getAttribute("urlpat");
      url = makeFrameUrl(urlpat, word);
      label = refselect.selectedOptions[0].innerText.split("[")[0].replace(/ *$/g,"") + " - " + word;
    }
    showFrameUrl(refurl, url, label);
  }

  article.addEventListener("input", saveUI, false);
  arthide.addEventListener("click", () => {
    article.style.display = (article.style.display == "none")? "block": "none";
    saveUI();
    loadUI();
  });
  artedit.addEventListener("click", () => {
    article.disabled = (article.disabled)? "": "disabled";
    saveUI();
    loadUI();
  });
  let artimport = document.getElementById("article-import");
  let artfile = document.getElementById("article-file");
  artimport.addEventListener("click", () => {
    artfile.showPicker();
  });
  artfile.addEventListener("change", () => {
    if (!artfile.value) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      article.value = e.target.result;
      saveUI();
    };
    for (let file of artfile.files) {
      reader.readAsText(file)
    }
    // clear value, so change event is triggered again for same file
    artfile.value = "";
  });
  help.addEventListener("click", () => {
    window.alert(article.placeholder);
  });
  setlang.addEventListener("click", () => {
    let v = window.prompt(S("lang-code") + langs, lang);
    if (langs.includes(v)) {
      lang = v;
      saveUI();
      loadUI(false, true); // chinese character heights are different
      loadWordFromUI();
      loadReferencesFromUI();
    }
  });
  wipe.addEventListener("click", () => {
    if (window.confirm(wipe.title + " - " + S("confirm"))) {
      lcra_storage.clear();
      loadUI(true);
      loadWordFromUI();
      loadReferencesFromUI();
    }
  });

  function addInput(input) {
    // split on non-Chinese characters
    let words = input.split(/[^\p{sc=Han}]+/gu);
    for (let w of words) {
      // confirm long words, giving a chance to edit
      if (w.length > 4) {
        w = window.prompt('"' + w + '" ' + S("confirm-long-word"), w);
      }
      // empty string is not a word
      if (!w) continue;
      // if word is already in the vocab, select it but don't add a new one
      let found = false;
      for (let o of vocab.options) {
        if (w == o.value) {
          selectOption(o);
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
  }

  vocab.addEventListener("change", () => {
    saveUI();
    loadWordFromUI();
    loadReferencesFromUI();
  });
  vocab.addEventListener("dragover", (e) => {
    // required to make drop work
    e.preventDefault();
  });
  vocab.addEventListener("drop", (e) => {
    // this doesn't work cross-origin unfortunately
    addInput(e.dataTransfer.getData("text"));
    e.preventDefault();
  });
  let addword = document.getElementById("addword");
  addword.addEventListener("click", () => {
    let input = article.value.substring(article.selectionStart, article.selectionEnd);
    input = input || window.prompt(S("input-or-select"), "");
    input && addInput(input);
  });
  addword.addEventListener("dragover", (e) => {
    // required to make drop work
    e.preventDefault();
  });
  addword.addEventListener("drop", (e) => {
    // this doesn't work cross-origin unfortunately
    addInput(e.dataTransfer.getData("text"));
    e.preventDefault();
  });
  let copyword = document.getElementById("copyword");
  copyword.addEventListener("click", () => {
    for (let o of vocab.selectedOptions) {
      navigator.clipboard.writeText(o.value);
    }
  });
  let delword = document.getElementById("delword");
  delword.addEventListener("click", () => {
    let i = vocab.selectedIndex;
    if (i < 0) return;
    let opt = vocab.options[i];
    vocab.selectedIndex += (i == vocab.options.length - 1)? -1: 1;
    if (!isNotExample(opt)) {
      exampleWord = null;
    }
    opt.remove();
    saveUI();
    loadWordFromUI();
    loadReferencesFromUI();
  });

  function download(url, label, cleanup) {
    // https://www.stefanjudis.com/snippets/how-trigger-file-downloads-with-javascript/
    // Create a link and set the URL using `createObjectURL`
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = label;

    // It needs to be added to the DOM so it can be clicked
    document.body.appendChild(link);
    link.click();

    // To make this work on Firefox we need to wait
    // a little while before removing it.
    setTimeout(() => {
      link.parentNode.removeChild(link);
      if (cleanup) cleanup();
    }, 0);
  }

  function exportVocab(contents, type) {
    let blob = new Blob(contents, {type});
    let url = URL.createObjectURL(blob);
    download(url, "chinese-vocab", () => URL.revokeObjectURL(url))
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
    let contents = JSON.parse(lcra_storage.getItem("lcra-vocab") || "[]");
    exportVocab([JSON.stringify(contents, null, 1)], "application/json");
  });
  let exportCsv = document.getElementById("vocab-export-csv");
  exportCsv.addEventListener("click", () => {
    let keys = "zh-Hans,zh-Latn-pinyin,en".split(",");
    let contents = JSON.parse(lcra_storage.getItem("lcra-vocab") || "[]");
    let lines = contents.map(opt => keys.map(k => csvEscape(opt[k])).join(",") + "\n");
    // https://docs.ankiweb.net/importing/text-files.html#file-headers
    // https://www.w3.org/International/questions/qa-choosing-language-tags
    let deckurl = document.location.href.replace(/([^/]*)$/,"sample.apkg");
    lines.unshift(`#deckurl:${deckurl}\n`);
    lines.unshift("#deck:Chinese words from reading list: 拼音, English\n");
    lines.unshift("#notetype:Basic " + keys[0] + ": " + keys.slice(1).join(", ") + "\n");
    lines.unshift("#columns:" + keys + "\n");
    lines.unshift("#separator:Comma\n");
    exportVocab(lines, "text/csv");
    if (!lcra_storage.getItem("lcra-anki-shown")) {
      if (window.confirm(S("sample-anki-deck"))) {
        download(deckurl, "sample.apkg");
      } else {
        window.alert(S("sample-anki-deck-url"));
      }
      lcra_storage.setItem("lcra-anki-shown", "1");
    }
  });

  let wordzh = document.getElementById("word-zh-Hans");
  let wordpy = document.getElementById("word-zh-Latn-pinyin");
  let worden = document.getElementById("word-en");
  function loadWordFromUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      wordzh.value = opt.value;
      wordpy.value = opt.getAttribute("zh-Latn-pinyin");
      worden.value = opt.getAttribute("en");
      for (let el of [wordzh, wordpy, worden]) {
        el.classList.remove("noword");
        el.disabled = "";
        if (isNotExample(opt)) {
          el.classList.remove("exword");
        } else {
          el.classList.add("exword");
        }
      }
    } else {
      for (let el of [wordzh, wordpy, worden]) {
        el.value = S("add-a-word");
        el.classList.add("noword");
        el.disabled = "disabled";
      }
    }
  }
  function saveWordIntoUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      opt.value = opt.innerText = wordzh.value;
      opt.setAttribute("zh-Latn-pinyin", wordpy.value);
      opt.setAttribute("en", worden.value);
      // any edit on an example automatically saves it
      opt.classList.remove("exword");
      exampleWord = null;
      for (let el of [wordzh, wordpy, worden]) {
        el.classList.remove("exword");
      }
    }
  }
  wordzh.addEventListener("input", () => {
    saveWordIntoUI();
    saveUI();
    loadReferencesFromUI();
  }, false);
  wordpy.addEventListener("input", () => {
    saveWordIntoUI();
    saveUI();
  }, false);
  wordpy.addEventListener("dblclick", () => {
    wordpy.value = provisionalPinyin(wordzh.value);
    saveWordIntoUI();
    saveUI();
  });
  worden.addEventListener("input", () => {
    saveWordIntoUI();
    saveUI();
  }, false);

  refselect.addEventListener("change", () => {
    saveUI();
    loadReferencesFromUI();
  });
  refui.addEventListener("click", () => {
    let old_idx = REFUI_ICONS.indexOf(refui.innerText);
    let mob = Number(lcra_detectMobile());
    let new_idx;
    switch (old_idx) {
    case 0:
      new_idx = mob? 1: 2;
      break;
    case 1:
      new_idx = mob? 3: 0;
      break;
    case 2:
      new_idx = 1;
      break;
    case 3:
      new_idx = 0;
      break;
    }
    setRefUI(new_idx);
    saveUI();
    if ((old_idx & 1) != (new_idx & 1)) {
      loadReferencesFromUI(true);
    }
  });

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

  setInterval(() => {
    let refui_idx = REFUI_ICONS.indexOf(refui.innerText);
    if (refui_idx >= 2) {
      let mob = Number(lcra_detectMobile());
      if (refui_idx - 2 != mob) {
        setRefUI(2 + mob);
        loadReferencesFromUI(true);
      }
    }
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
    let w = control.clientWidth;
    let h = histctl.offsetHeight;
    for (let i = 0; i < 128; i++) {
      vocab.size++;
      if (vocab.offsetHeight == oh) {
        // some browsers don't support resizing a <select>
        break;
      }
      // sometimes browsers add redundant scrollbars, check clientWidth to prevent this
      if (histctl.offsetHeight > h || control.clientWidth < w) {
        let s = vocab.size - 1;
        vocab.size = 1;
        // give the browser some time to remove the scrollbars
        setTimeout(() => {
          vocab.size = s;
          // ensure selection is in view
          for (let el of vocab.selectedOptions) {
            el.scrollIntoView();
          }
        }, 1);
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

  loadUI(true);
  loadWordFromUI();
  loadReferencesFromUI();
});
