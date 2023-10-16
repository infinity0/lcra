function extractTooManyRequestsInfo(html) {
  const ip = html.match(/IP address: (.+?)<br>/)?.[1] || '';
  const time = html.match(/Time: (.+?)<br>/)?.[1] || '';
  const url = (html.match(/URL: (.+?)<br>/)?.[1] || '').replace(/&amp;/g, '&');
  return { ip, time, url };
}

async function googleTranslate(inputText, from, to, proxy, extraHeaders) {
  // TODO: Google gives 429 very very quickly for this API endpoint.
  const url = [
    `https://translate.google.com/translate_a/single`,
    '?client=at',
    '&dt=t',  // return sentences
    '&dt=rm', // add translit to sentences
    '&dj=1',  // result as pretty json instead of deep nested arrays
  ].join('');

  const res = await fetch(proxy + url, {
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      ...extraHeaders
    },
    body: new URLSearchParams({
      sl: from,
      tl: to,
      q: inputText,
    }),

  });

  if (!res.ok) {
    if (res.status === 429) {
      const text = await res.text();
      const { ip, time, url } = extractTooManyRequestsInfo(text);
      const message = `${res.statusText} IP: ${ip}, Time: ${time}, Url: ${url}`;
      throw new Error(res.status, message);
    } else {
      throw new Error(res.status, res.statusText);
    }
  }

  const raw = await res.json();
  const text = raw.sentences
    .filter(s => 'trans' in s)
    .map(s => s.trans)
    .join('');
  return { text, raw };
}
