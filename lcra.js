let preloadUnselected = true; // set false e.g. for testing to avoid logging clutter
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

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
  let articleHide = (reinit && initHide !== null)? initHide == "true": lcra_storageGetBool("lcra-article-hide", false);
  article.style.display = articleHide? "none": "block";
  return articleHide;
}

window.addEventListener("DOMContentLoaded", async () => {

  let langs = ["en", "zh-Hans"];
  let lang;
  let bandwidths = ["full", "low", "very-low"];
  let bandwidth;
  let strings = {
    "confirm": {
      "en": "Are you sure?",
      "zh-Hans": "确定吗？",
    },
    "setlang": {
      "en": "Enter language code, one of: ",
      "zh-Hans": "输入语言代码，其中之一：",
    },
    "setbw": {
      "en": "Set the desired bandwidth usage, one of: ",
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
    "input": {
      "en": "Please input the words to add, separated by spaces.",
      "zh-Hans": "请输入要添加的单词，以空格分隔。",
    },
    "or-select": {
      "en": "Or, select some in the article then try again.",
      "zh-Hans": "或者，在文章里选择一些然后再重试。",
    },
    "confirm-long-word": {
      "en": "may not be a word. Really add?",
      "zh-Hans": "可能不是单词。真的添加？",
    },
    "refui-text": {
      "en": ["Desktop UI", "Mobile UI", "Auto UI: Desktop", "Auto UI: Mobile"],
    },
    "incomplete-words": {
      "en": "Incomplete words listed above. Continue with export?",
    },
    "sample-anki-deck": {
      "en": "Also download a sample Anki deck for importing the CSV into?",
    },
    "sample-anki-deck-url": {
      "en": "To download it later, the URL to the deck is inside the CSV file.",
    },
    "ref-cancel": {
      "en": "Baidu Baike reference has been blanked. Your menus should now be unbugged. For details see https://github.com/infinity0/lcra/issues/6",
    },
  };
  function S(k) {
    for (let l of [lang, ...langs]) {
      if (l in strings[k]) {
        return strings[k][l]
      }
    }
  }

  let wordattrs = ["zh-Hans", "zh-Latn-pinyin", "en", "ex_src-title", "ex_src-url"];
  const zhtw = OpenCC.Converter({ from: 'cn', to: 'tw' });

  let article = document.getElementById("article");
  let artph = document.getElementById("article-placeholder");
  let arttext = document.getElementById("article-text");
  let artselection = "";
  let arthide = document.getElementById("article-hide");
  let artedit = document.getElementById("article-edit");
  let help = document.getElementById("help");
  let setlang = document.getElementById("setlang");
  let setbw = document.getElementById("setbw");
  let wipe = document.getElementById("wipe");
  let vocab = document.getElementById("vocab");
  let histctl = document.getElementById("histctl");
  let references = document.getElementsByClassName("reference");
  let refselect = document.getElementById("refselect");
  let refurl = document.getElementById("refurl").querySelector("a");
  let refcancel = document.getElementById("refcancel").querySelector("a");
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

  function isExample(opt) {
    return Array.from(opt.classList).includes("exword");
  }

  function unsetIfExample(opt) {
    let wasExample = isExample(opt);
    opt.classList.remove("exword");
    exampleWord = null;
    return wasExample;
  }

  function setWordAppearance(opt) {
    // some browsers take a bit to apply the style
    setTimeout(() => {
      let style = getComputedStyle(opt);
      let invalid = style.getPropertyValue("--invalid").trim() == '"invalid"';
      opt.innerText = opt.value + (invalid? " (!)": "");
    }, 1);
  }

  function mkWord(word, def) {
    return Object.assign(
      Object.fromEntries(wordattrs.map(a => [a, ""])),
      def,
      {
        "zh-Hans": word,
        "zh-Latn-pinyin": provisionalPinyin(word),
      }
    );
  }

  function addWord(word) {
    let opt = document.createElement("option");
    opt.value = word["zh-Hans"];
    for (let a of wordattrs) {
      opt.setAttribute(a, word[a]);
    }
    vocab.appendChild(opt);
    setWordAppearance(opt);
    selectOption(opt);
    return opt;
  }

  function findWordOpt(word) {
    for (let opt of vocab.options) {
      if (opt.value == word) {
        return opt;
      }
    }
  }

  function getWords() {
    return Array.from(vocab.options).filter(o => !isExample(o)).map(
      opt => Object.fromEntries(wordattrs.map(a => [a, opt.getAttribute(a)]))
    );
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
  }

  async function loadUI(reinit, resize) {
    lang = selectLanguage([...(reinit? [searchParams.get("lang")]: []), lcra_storage.getItem("lcra-lang"), ...navigator.languages]);
    loadLang("content", (el, v) => {
      el.innerText = v;
      // dumb spec behaviour https://stackoverflow.com/questions/67286355
      // so also set the content attribute, so we can get the clean version later
      el.setAttribute("content", v);
    });
    loadLang("title", (el, v) => { el.title = v; });
    loadLang("placeholder", (el, v) => { el.setAttribute("placeholder", v); });

    bandwidth = lcra_storage.getItem("lcra-bandwidth");
    if (!bandwidths.includes(bandwidth)) bandwidth = "full";

    vocab.replaceChildren([]);
    for (let word of JSON.parse(lcra_storage.getItem("lcra-vocab") || "[]")) {
      addWord(word);
    }
    if (reinit) {
      exampleWord = searchParams.get("exword") || (vocab.options.length? null: "例子");
    }
    if (exampleWord) {
      let found = findWordOpt(exampleWord);
      if (found) {
        selectOption(found);
      } else {
        let opt = addWord(mkWord(exampleWord));
        opt.classList.add("exword");
        selectOption(opt);
      }
    } else {
      let found = findWordOpt(lcra_storage.getItem("lcra-vocab-selected"));
      if (found) {
        selectOption(found);
      }
    }
    arttext.innerText = lcra_storage.getItem("lcra-article") || (reinit? artph.getAttribute("content"): "");
    loadPlaceholderFromUI();
    arttext.setAttribute("contenteditable", lcra_storageGetBool("lcra-article-edit", true) + "");
    arthide.innerText = lcra_articleHide(reinit)? "⇥": "⇤";
    artedit.innerText = lcra_storageGetBool("lcra-article-edit", true)? "✎": "🔒︎";
    artedit.title = lcra_storageGetBool("lcra-article-edit", true)? S("article-unlocked"): S("article-locked");
    setRefUI(preloadRefUI());
    if (lcra_storage.getItem("lcra-reference")) {
      refselect.value = lcra_storage.getItem("lcra-reference");
    }
    if (reinit || resize) {
      await autoResizeVocab();
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
    lcra_storage.setItem("lcra-bandwidth", bandwidth);
    lcra_storage.setItem("lcra-vocab", JSON.stringify(getWords()));
    for (let opt of vocab.selectedOptions) {
      if (!isExample(opt)) {
        lcra_storage.setItem("lcra-vocab-selected", opt.value);
      }
    }
    if (arttext.offsetParent !== null) {
      // dumb spec behaviour https://stackoverflow.com/questions/67286355
      lcra_storage.setItem("lcra-article", arttext.innerText.trimEnd());
    }
    lcra_storage.setItem("lcra-article-hide", (article.style.display == "none")? "1": "0");
    lcra_storage.setItem("lcra-article-edit", (arttext.getAttribute("contenteditable") + "" === "true")? "1": "0");
    lcra_storage.setItem("lcra-reference-ui", presaveRefUI());
    lcra_storage.setItem("lcra-reference", refselect.value);
  }

  function loadFrame(el, url, reload) {
    if (url === null) {
      if (el.clearSrc) {
        el.clearSrc();
      }
      return;
    }
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

  function checkBandwidthOk(bwUsage) {
    switch (bandwidth + "/" + bwUsage) {
    case "very-low/high":
    case "very-low/mid":
    case "low/high":
      return false;
    default:
      return true;
    }
  }

  function loadReferencesFromUI(reload) {
    let word = vocab.value;

    let refui_ty = (REFUI_ICONS.indexOf(refui.innerText) & 1)? "mobile": "desktop";
    for (let a of ["cors-headers", "urlpat", "refurlpat", "use-proxy-if", "src-transform"]) {
      loadAttr(a, [refui_ty], (el, v) => { el.setAttribute(a, v); });
    }

    for (let el of references) {
      if ("proxies" in el) {
        el.proxies = lcraProxies();
      }
      let urlpat = el.getAttribute("urlpat");
      let isSelected = (refselect.value == el.id);
      let bandwidthOk = checkBandwidthOk(el.getAttribute("bandwidth-use"));
      // setting display: none prevents some browsers from scrolling to #-URLs
      el.style.visibility = isSelected? "visible": "hidden";
      if (isSelected || preloadUnselected) {
        loadFrame(el,
          (isSelected || bandwidthOk)? makeFrameUrl(urlpat, word): null,
          reload);
      }
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

  function checkAncestor(node, anc) {
    let cur = node;
    while (cur !== null && cur !== document) {
      if (cur == anc) {
        return true;
      }
      cur = cur.parentNode;
    }
    return false;
  }

  function saveSelection() {
    let s = window.getSelection();
    if (checkAncestor(s.anchorNode, arttext) && checkAncestor(s.focusNode, arttext)) {
      artselection = s.toString();
    } else {
      artselection = "";
    }
  }

  function loadPlaceholderFromUI() {
    artph.style.display = (arttext.innerText && arttext.innerText != "\n")? "none": "block";
  }

  arttext.addEventListener("input", () => {
    saveUI();
    loadPlaceholderFromUI();
  }, false);
  document.addEventListener("selectionchange", saveSelection);
  arthide.addEventListener("click", async () => {
    article.style.display = (article.style.display == "none")? "block": "none";
    saveUI();
    await loadUI();
  });
  artedit.addEventListener("click", async () => {
    arttext.setAttribute("contenteditable", (arttext.getAttribute("contenteditable") + "" === "true")? "false": "true");
    saveUI();
    await loadUI();
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
      arttext.innerText = e.target.result;
      saveUI();
      loadPlaceholderFromUI();
    };
    for (let file of artfile.files) {
      reader.readAsText(file)
    }
    // clear value, so change event is triggered again for same file
    artfile.value = "";
  });
  help.addEventListener("click", async () => {
    let placeholder = artph.getAttribute("content");
    article.style.display = "block";
    if (!arttext.innerText.startsWith(placeholder.trimEnd())) {
      arttext.innerText = placeholder + "\n----\n\n" + arttext.innerText;
    }
    saveUI();
    await loadUI();
  });
  setlang.addEventListener("click", async () => {
    let v = window.prompt(S("setlang") + langs, lang);
    if (langs.includes(v)) {
      lang = v;
      saveUI();
      await loadUI(false, true); // chinese character heights are different
      loadWordFromUI();
      loadReferencesFromUI();
    }
  });
  setbw.addEventListener("click", async () => {
    let v = window.prompt(S("setbw") + bandwidths, bandwidth);
    if (bandwidths.includes(v)) {
      bandwidth = v;
      saveUI();
      await loadUI();
      loadWordFromUI();
      loadReferencesFromUI();
    }
  });
  wipe.addEventListener("click", async () => {
    if (window.confirm(wipe.title + " - " + S("confirm"))) {
      lcra_storage.clear();
      await loadUI(true);
      loadWordFromUI();
      loadReferencesFromUI();
    }
  });

  function addInput(input) {
    let selectedSrc = {};
    if (vocab.selectedOptions.length) {
      selectedSrc["ex_src-title"] = vocab.selectedOptions[0].getAttribute("ex_src-title");
      selectedSrc["ex_src-url"] = vocab.selectedOptions[0].getAttribute("ex_src-url");
    }
    // split on non-Chinese characters
    let words = input.split(/[^\p{sc=Han}]+/gu);
    for (let w of words) {
      // confirm long words, giving a chance to edit
      if (w.length > 4) {
        w = window.prompt('"' + w + '" ' + S("confirm-long-word"), w);
      }
      // empty string is not a word
      if (!w) continue;
      let found = findWordOpt(w);
      if (found) {
        selectOption(found);
        unsetIfExample(found);
      } else {
        addWord(mkWord(w, selectedSrc));
      }
    }
    for (let o of vocab.options) {
      if (unsetIfExample(o)) {
        o.remove();
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
    let input = artselection;
    input = input || window.prompt(
      S("input") + " " + S("or-select"),
      Array.from(vocab.selectedOptions).map(o => o.value).join("")
    );
    input && addInput(input);
  });
  let findword = document.getElementById("findword");
  findword.addEventListener("click", (e) => {
    // clear old results
    let oldFound = arttext.querySelectorAll(".found");
    let sameword = false;
    if (oldFound.length) {
      sameword = oldFound[0].innerText == vocab.value;
      if (!sameword || e.shiftKey) {
        for (let el of oldFound) {
          el.replaceWith(el.firstChild);
        }
      }
    }
    if (!vocab.value) {
      return;
    }
    // add spans for new results
    if (!sameword) {
      arttext.innerHTML = arttext.innerHTML.replaceAll(vocab.value, `<span class="found">${vocab.value}</span>`);
    }
    // scroll to next result
    if (!e.shiftKey) { // FIXME: long press
      let found = arttext.querySelectorAll(".found");
      if (found.length) {
        found = Array.from(found);
        let oldfocus = found.findIndex(el => el.classList.contains("found-focus"));
        if (oldfocus == found.length - 1) {
          // we reached the end, clear all highlights
          // next click will start from beginning
          for (let el of found) {
            el.replaceWith(el.firstChild);
          }
        } else {
          if (oldfocus >= 0) {
            found[oldfocus].classList.remove("found-focus");
          }
          focus = found[oldfocus + 1];
          focus.classList.add("found-focus");
          focus.scrollIntoView();
        }
      }
    }
  });
  let delword = document.getElementById("delword");
  delword.addEventListener("click", () => {
    let i = vocab.selectedIndex;
    if (i < 0) return;
    let opt = vocab.options[i];
    vocab.selectedIndex += (i == vocab.options.length - 1)? -1: 1;
    unsetIfExample(opt);
    opt.remove();
    saveUI();
    loadWordFromUI();
    loadReferencesFromUI();
  });
  let delallword = document.getElementById("delallword");
  delallword.addEventListener("click", () => {
    if (window.confirm(delallword.title + " - " + S("confirm"))) {
      for (let i = vocab.options.length - 1; i >= 0; i--) {
        let opt = vocab.options[i];
        unsetIfExample(opt);
        opt.remove();
      }
      saveUI();
      loadWordFromUI();
      loadReferencesFromUI();
    }
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
    if (text.indexOf(",") < 0 && text.indexOf("\n") < 0) {
      return text;
    } else {
      return '"' + text.replace(/"/g, '""') + '"';
    }
  }

  function getVocab() {
    let contents = JSON.parse(lcra_storage.getItem("lcra-vocab") || "[]");
    let incomplete = [];
    for (let word of contents) {
      if (!word["zh-Latn-pinyin"]){
        incomplete.push(word["zh-Hans"] + ": pinyin");
      }
      if (!word["en"]) {
        incomplete.push(word["zh-Hans"] + ": English");
      }
    }
    if (incomplete.length) {
      if (window.confirm(incomplete.join("\n") + "\n" + S("incomplete-words"))) {
        return contents;
      } else {
        return null;
      }
    } else {
      return contents;
    }
  }

  let exportJson = document.getElementById("vocab-export-json");
  exportJson.addEventListener("click", () => {
    let contents = getVocab();
    if (!contents) return;
    exportVocab([JSON.stringify(contents, null, 1)], "application/json");
  });
  let exportCsv = document.getElementById("vocab-export-csv");
  exportCsv.addEventListener("click", () => {
    let contents = getVocab();
    if (!contents) return;
    let lines = contents.map(opt => wordattrs.map(k => csvEscape(opt[k])).join(",") + "\n");
    // https://docs.ankiweb.net/importing/text-files.html#file-headers
    // https://www.w3.org/International/questions/qa-choosing-language-tags
    let deckurl = document.location.href.replace(/([^/]*)$/,"sample.apkg");
    lines.unshift(`#deckurl:${deckurl}\n`);
    lines.unshift("#deck:Chinese words from reading list: 拼音, English\n");
    lines.unshift("#notetype:Basic zh-Hans: zh-Latn-pinyin, en\n");
    lines.unshift("#columns:" + wordattrs + "\n");
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

  let worddetails = wordattrs.map(a => document.getElementById(`word_${a}`));
  let [wordzh, wordpy, worden, wordsrct, wordsrcu] = worddetails;
  function loadWordFromUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      for (let a of wordattrs) {
        document.getElementById(`word_${a}`).value = opt.getAttribute(a, "");
      }
      for (let el of worddetails) {
        el.classList.remove("noword");
        el.disabled = "";
        if (isExample(opt)) {
          el.classList.add("exword");
        } else {
          el.classList.remove("exword");
        }
      }
    } else {
      for (let el of worddetails) {
        el.value = S("add-a-word");
        el.classList.add("noword");
        el.disabled = "disabled";
      }
    }
  }
  function saveWordIntoUI() {
    if (vocab.selectedOptions.length) {
      let opt = vocab.selectedOptions[0];
      for (let a of wordattrs) {
        opt.setAttribute(a, document.getElementById(`word_${a}`).value);
      }
      opt.value = wordzh.value;
      setWordAppearance(opt);
      unsetIfExample(opt); // any edit on an example automatically saves it
      for (let el of worddetails) {
        el.classList.remove("exword");
      }
    }
  }
  for (let el of worddetails) {
    el.addEventListener("input", () => {
      saveWordIntoUI();
      saveUI();
    }, false);
  }
  wordzh.addEventListener("input", () => {
    loadReferencesFromUI();
  }, false);
  wordpy.addEventListener("dblclick", () => {
    wordpy.value = provisionalPinyin(wordzh.value);
    saveWordIntoUI();
    saveUI();
  });

  refselect.addEventListener("change", () => {
    saveUI();
    loadReferencesFromUI();
  });
  refcancel.addEventListener("click", () => {
    let bel = document.getElementById("baidu-baike");
    if (bel.clearSrc) {
      bel.clearSrc();
    } else {
      bel.src = "about:blank";
    }
    // if we alert immediately then the workaround fails.
    // if the timeout is too small then it also fails.
    // buggy piece of shit Android Chromium.
    window.setTimeout(() => {
      window.alert(S("ref-cancel"));
    }, 125);
  })
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

  async function resizeVocab(size) {
    vocab.size = size;
    await sleep(1); // give browser some time to render
    return vocab.size;
  }

  async function autoResizeVocab() {
    let ol = vocab.options.length;
    if (ol == 0) {
      // if the vocab is empty then some browsers don't calculate the heights properly
      // due to Chinese characters having different heights from default ones
      addWord(mkWord("虚设"));
    }
    await resizeVocab(1);
    let oh = vocab.offsetHeight;
    let w = control.clientWidth;
    let h = histctl.offsetHeight;
    for (let i = 0; i < 128; i++) {
      await resizeVocab(vocab.size + 1);
      if (vocab.offsetHeight == oh) {
        // some browsers don't support resizing a <select>
        break;
      }
      // sometimes browsers add redundant scrollbars, check clientWidth to prevent this
      if (histctl.offsetHeight > h || control.clientWidth < w) {
        let s = vocab.size - 1;
        await resizeVocab(Math.max(s - 1, 1));
        await resizeVocab(s);
        // ensure selection is in view
        for (let el of vocab.selectedOptions) {
          el.scrollIntoView();
        }
        break;
      }
    }
    if (ol == 0) {
      vocab.replaceChildren([]);
    }
  }
  let resizeTO = null;
  window.addEventListener("resize", async () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(autoResizeVocab, 125);
  });

  await loadUI(true);
  loadWordFromUI();
  window.parent.postMessage({
    appName: "lcra",
    event: "appInit",
    // helper for things that include us in an <iframe>
  }, "*");
  loadReferencesFromUI();
});
