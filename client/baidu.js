// adapted from https://github.com/kgspider/crawler/blob/main/fanyi_baidu_com/baidufanyi.py

const BAIDU_INDEX_URL = 'https://fanyi.baidu.com/';
const BAIDU_TRANSLATE_URL = 'https://fanyi.baidu.com/v2transapi';
const ALLOW_COOKIES = ['BAIDUID', 'BAIDUID_BFESS'];

function makeProxyURL(corsProxy, url) {
  if (!corsProxy) {
    console.warn("Trying Baidu Translate without a CORS Proxy. You will probably get CORS errors.");
  }
  corsProxy = corsProxy || "";
  if (corsProxy.indexOf("?") >= 0) {
    return corsProxy + encodeURIComponent(url);
  } else {
    return corsProxy + url;
  }
}

let baiduSetupPromise;
let baiduSetupCookies;
async function baiduSetup(corsProxy, extraHeaders) {
  try {
    const resp = await fetch(
      makeProxyURL(corsProxy, BAIDU_INDEX_URL),
      {
        method: "head",
        headers: extraHeaders,
        signal: AbortSignal.timeout(8000),
      }
    )
    await resp.text();

    let corsHeaders = JSON.parse(resp.headers.get("x-cors-headers") || "{}");
    baiduSetupCookies = [];
    //console.log(corsHeaders["set-cookie"]);
    for (let cookie of corsHeaders["set-cookie"] || []) {
      cookie = cookie.split(";")[0];
      let cname = cookie.split("=")[0];
      if (ALLOW_COOKIES.includes(cname)) {
        baiduSetupCookies.push(cookie);
      }
    }
    if (!baiduSetupCookies.length) {
      throw new Error(`Did not receive expected cookies from Baidu. Does the corsProxy set X-Cors-Headers?`);
    }
  } catch (e) {
    console.error('Failed to fetch Baidu HEAD', e)
    throw e
  }
}

let baiduInitTime;
let baiduToken;
let baiduGtk;

let baiduResetPromise;
async function baiduResetToken(query, corsProxy, extraHeaders) {
  try {
    if (!baiduSetupPromise) {
      baiduSetupPromise = baiduSetup(corsProxy, extraHeaders);
      await baiduSetupPromise
    }
  } catch (e) {
    baiduSetupPromise = null;
    throw e;
  }

  baiduInitTime = (new Date).getTime();
  try {
    const resp = await fetch(
      makeProxyURL(corsProxy, BAIDU_INDEX_URL),
      {
        headers: {
          "X-Cors-Headers": JSON.stringify({"cookie": baiduSetupCookies.join("; ")}),
          ...extraHeaders
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    const body = await resp.text();
    baiduToken = body.match(/token: '(\w+)'/)[1];
    baiduGtk = body.match(/gtk *[=:] *['"]([\d\.]*)['"]/)[1];
    //console.log(gtk, token);
  } catch (e) {
    try {
      let errMsg = await e.response.text();
      console.error('Failed to fetch Baidu tokens: ${errMsg}', e);
    } catch (e2) {
      console.error('Failed to fetch Baidu tokens.', e);
    }
    throw e
  }
}

async function baiduTranslate(query, corsProxy, extraHeaders) {
  try {
    if (!baiduResetPromise) {
      baiduResetPromise = baiduResetToken(query, corsProxy, extraHeaders);
    }
    await baiduResetPromise;

    if (!baiduInitTime || (new Date).getTime() - baiduInitTime > 3600000) {
      baiduResetPromise = baiduResetToken(query, corsProxy, extraHeaders);
      await baiduResetPromise;
    }
  } catch (e) {
    baiduResetPromise = null;
    throw e;
  }

  let lang = "zh"
  let sign = baiduSign(query, baiduGtk)
  let translate_url = `https://fanyi.baidu.com/#${lang}/en/${encodeURIComponent(query)}`;
  let acs_token = baiduAscToken(baiduInitTime, translate_url);
  let requestBody = {
    'from': lang,
    'to': 'en',
    'query': query,
    //'transtype': 'realtime',
    'simple_means_flag': '3',
    'sign': sign,
    'token': baiduToken,
  };

  // Baidu Translate seems to be overloaded or something.
  // Sometimes it works first time.
  // Other times you really do need to retry 10 times.
  for (let i = 8; i > 0; i--) {
    //console.log("retry ", i);
    try {
      const resp = await fetch(
        makeProxyURL(corsProxy, BAIDU_TRANSLATE_URL),
        {
          method: "post",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Cors-Headers": JSON.stringify({
              "cookie": baiduSetupCookies.join("; "),
              "Acs-Token": acs_token, // some reverse proxies e.g. lighttpd like to strip non-standard headers, put it here to be safe
              "referer": BAIDU_INDEX_URL,  // some reverse proxies e.g. lighttpd like to set the referer to the proxy origin, which baidu blocks
            }),
            ...extraHeaders,
          },
          body: new URLSearchParams(requestBody),
          signal: AbortSignal.timeout(4000),
        }
      )

      if (resp.status >= 400) {
        throw new Error(`Something went wrong! The response is ${JSON.stringify(body)}.`)
      }

      const output = await resp.text();
      const body = JSON.parse(output);

      let errno = body.error || body.errno;
      if (errno) {
        throw new Error(`Baidu service gave back an error: ${errno}, ${body.errmsg}`, { cause: body });
      }

      //console.log("body", i, body);
      return body;
    } catch (e) {
      if (i > 1) {
        continue;
      }
      console.error('Failed to fetch Baidu translation result')
      let errno = e.cause.error || e.cause.errno;
      if ([1000, 1022].includes(errno)) {
        let subject = (corsProxy)? "corsProxy": "client";
        let extra = (corsProxy)? "Run the corsProxy on localhost to test if this is the case.": "";
        console.error(`Error ${errno} typically indicates Baidu is throttling or blocking the ${subject} IP address. ${extra}`);
      }
      throw e
    }
  }
}

function baiduPrettyPrintDictionary(dres) {
  let defs = {}; // { py: { part: dd } };
  if (dres.synthesize_means && dres.synthesize_means.symbols) {
    // defs for single-char words
    dres.synthesize_means.symbols.map(sym => sym.parts.map(part => {
      let subparts = part.means.map(sp => `<li>${sp.word_mean}</li>`).join("");
      let k = sym.word_symbol;
      (defs[k] ||= {})[part.part_name] = `<ol>${subparts}</ol>`;
    }));
  }
  if (dres.zdict && dres.zdict.simple && dres.zdict.simple.means) {
    // defs for multi-char words
    // updated 2023-10-16. we prefer the zdict, as it's:
    // - generally more complete than dres.synthesize_means.cys
    // - generally better structured than dres.simple_means.symbols
    dres.zdict.simple.means.map(mean => mean.exp.map(ent => {
      // Baidu seems to have cut corners on parsing the original source here.
      // Example sentences are interspersed with meanings, which have hard-coded text bullet points
      // We abuse browsers' forgiving parsing of HTML open tags to produce a nice result.
      let r = /^\(\d+\)\s*(.*)$/g;
      let sawEmptyBullet = false;
      let means = ent.des.map(e => {
        let s = e.main.replace(/;\s*/g, "; ").replace(/\[([^\]].*)\][∶:]?\s*/, (_, s1) => `[${s1}]: `);
        let wasEmpty = sawEmptyBullet;
        sawEmptyBullet = false;
        return s.match(r)? s.replace(r, (_, str) => {
          if (str.length) {
            return `</ul><li>${str}<ul>`;
          } else {
            sawEmptyBullet = true;
            return `</ul><li>`;
          }
        }): (wasEmpty? `${s}<ul>`: `<li>${s}`);
      }).join("").replace(/^<\/ul>/, "");
      let k = mean.pinyin;
      (defs[k] ||= {})["释义"] = `<ol>${means}</ol>`;
    }));
  }
  return Object.entries(defs).map(([k, ent]) =>
    Object.entries(ent).map(([p, v]) =>
      `<dt>${k} – ${p}</dt><dd>${v}</dd>`
    ).join("")
  ).join("");
}
