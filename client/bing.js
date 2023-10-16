// adapted from https://github.com/plainheart/bing-translate-api/blob/master/src/index.js

const TRANSLATE_API_ROOT = 'https://{s}bing.com'
const TRANSLATE_WEBSITE = TRANSLATE_API_ROOT + '/translator'
const TRANSLATE_API = TRANSLATE_API_ROOT + '/ttranslatev3?isVertical=1'
const TRANSLATE_API_SPELL_CHECK = TRANSLATE_API_ROOT + '/tspellcheckv3?isVertical=1'

// PENDING: fetch from `params_RichTranslate`?
const MAX_TEXT_LEN = 1000
// PENDING
const MAX_CORRECT_TEXT_LEN = 50

/**
 * @typedef {{
 *  IG: string,
 *  IID: string,
 *  subdomain?: string,
 *  key: number,
 *  token: string,
 *  tokenTs: number,
 *  tokenExpiryInterval: number,
 *  count: number
 * }} GlobalConfig
 *
 * @typedef {import('../index').TranslationResult} TranslationResult
 *
 * @typedef {import('got').Agents} GotAgents
 */

/**
 * @type {GlobalConfig | undefined}
 */
let globalConfig
/**
 * @type {Promise<GlobalConfig> | undefined}
 */
let globalConfigPromise

function replaceSubdomain(url, subdomain) {
  return url.replace('{s}', subdomain ? subdomain + '.' : '')
}

/**
 * refetch global config if token is expired
 * @return {boolean} whether token is expired or not
 */
function isTokenExpired() {
  if (!globalConfig) {
    return true
  }
  const { tokenTs, tokenExpiryInterval } = globalConfig
  return Date.now() - tokenTs > tokenExpiryInterval
}

async function fetchGlobalConfig(corsProxy, extraHeaders) {
  // use last subdomain if exists
  let subdomain = globalConfig && globalConfig.subdomain

  try {
    const origUrl = makeProxyURL(corsProxy, replaceSubdomain(TRANSLATE_WEBSITE, subdomain));
    const resp = await fetch(
      origUrl,
      {
        headers: {
          ...extraHeaders
        },
      }
    )
    const { headers } = resp;
    // NOTE: X-Final-Url is set by CORS-Anywhere, it needs to be adapted for other proxies
    const url = headers.get("X-Final-Url") || resp.url.toString();

    // when fetching for the second time, the subdomain may be unchanged
    if (url != origUrl) {
      subdomain = url.toString().match(/https?:\/\/(\w+)\.bing\.com/)[1]
    }
    //console.log("subdomain: ", subdomain);

    const body = await resp.text();

    const IG = body.match(/IG:"([^"]+)"/)[1]
    const IID = Array.from(body.matchAll(/data-iid="([^"]+)"/g)).pop()[1]

    const [key, token, tokenExpiryInterval] = JSON.parse(
      body.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/)[1]
    )

    const requiredFields = {
      IG,
      IID,
      key,
      token,
      tokenTs: key,
      tokenExpiryInterval
    }
    // check required fields
    Object.entries(requiredFields).forEach(([field, value]) => {
      if (!value) {
        throw new Error(`failed to fetch required field: \`${field}\``)
      }
    })

    return globalConfig = {
      ...requiredFields,
      subdomain,
      // PENDING: reset count when value is large?
      count: 0
    }
  } catch (e) {
    console.error('failed to fetch global config', e)
    console.log(await e.response.text());
    throw e
  }
}

function makeProxyURL(corsProxy, url) {
  corsProxy = corsProxy || "";
  if (corsProxy.indexOf("?") >= 0) {
    return corsProxy + encodeURIComponent(url);
  } else {
    return corsProxy + url;
  }
}

function makeRequestURL(isSpellCheck) {
  const { IG, IID, subdomain } = globalConfig
  return replaceSubdomain(isSpellCheck ? TRANSLATE_API_SPELL_CHECK : TRANSLATE_API, subdomain)
    + '&IG=' + IG
    + '&IID=' + (IID + '.' + (++globalConfig.count))
}

function makeRequestBody(isSpellCheck, text, fromLang, toLang) {
  const { token, key } = globalConfig
  const body = {
    fromLang,
    text,
    token,
    key
  }
  if (!isSpellCheck && toLang) {
    body.to = toLang
  }
  return body
}

async function bingTranslate(text, from, to, correct, raw, corsProxy, extraHeaders) {
  if (!text || !(text = text.trim())) {
    return
  }

  if (text.length > MAX_TEXT_LEN) {
    throw new Error(`The supported maximum length of text is ${MAX_TEXT_LEN}. Please shorten the text.`)
  }

  extraHeaders = extraHeaders || {}

  try {
    if (!globalConfigPromise) {
      globalConfigPromise = fetchGlobalConfig(corsProxy, extraHeaders)
    }
    await globalConfigPromise

    if (isTokenExpired()) {
      globalConfigPromise = fetchGlobalConfig(corsProxy, extraHeaders)
      await globalConfigPromise
    }
  } catch (e) {
    globalConfigPromise = null;
    throw e;
  }

  from = from || 'auto-detect'
  to = to || 'en'

  const requestURL = makeProxyURL(corsProxy, makeRequestURL(false))
  const requestBody = makeRequestBody(false, text, from, to === 'auto-detect' ? 'en' : to)

  const requestHeaders = {
    referer: replaceSubdomain(TRANSLATE_WEBSITE, globalConfig.subdomain),
    ...extraHeaders
  }

  //console.log(requestURL);
  //console.log(requestHeaders);
  //console.log(requestBody);
  const resp = await fetch(requestURL, {
    method: "post",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...requestHeaders,
    },
    body: new URLSearchParams(requestBody),
  })

	//console.log(resp);
  //console.log(Array.from(resp.headers.entries()).map(p => p[0] + ": " + p[1]).join("\n"));
  const output = await resp.text();
  if (!output.length) {
    let extra = (corsProxy)? "Did the corsProxy send X-Final-URL?": "";
    throw new Error(`Got empty body response; typically this means the subdomain wasn't set correctly. ${extra}`);
  }
  const body = JSON.parse(output);

  if (resp.status >= 400) {
    if (body.ShowCaptcha) {
      let subject = (corsProxy)? "corsProxy": "client";
      let extra = (corsProxy)? "Run the corsProxy on localhost to test if this is the case.": "";
      console.error(`ShowCaptcha typically indicates Bing is throttling or blocking the ${subject} IP address. ${extra}`);
    }
    throw new Error(`Something went wrong! The response is ${JSON.stringify(body)}.`)
  }

  const translation = body[0].translations[0]
  const detectedLang = body[0].detectedLanguage

  /**
   * @type {TranslationResult}
   */
  const res = {
    text,
    userLang: from,
    translation: translation.text,
    language: {
      from: detectedLang.language,
      to: translation.to,
      score: detectedLang.score
    }
  }

  if (correct) {
    const correctLang = detectedLang.language
    const matcher = text.match(/"/g)
    const len = text.length + (matcher && matcher.length || 0)
    // currently, there is a limit of 50 characters for correction service
    // and only parts of languages are supported
    // otherwise, it will return status code 400
    if (len <= MAX_CORRECT_TEXT_LEN) {
      const requestURL = makeProxyURL(corsProxy, makeRequestURL(true));
      const requestBody = makeRequestBody(true, text, correctLang)

      const { body } = await fetch(requestURL, {
        method: "post",
        headers: requestHeaders,
        form: requestBody,
        responseType: 'json',
      })

      res.correctedText = body && body.correctedText
    }
    else {
      console.warn(`The detected language '${correctLang}' is not supported to be corrected or the length of text is more than ${MAX_CORRECT_TEXT_LEN}.`)
    }
  }

  if (raw) {
    res.raw = body
  }

  return res
}
