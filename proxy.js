const shuffleArray = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

const LCRA_PROXY = [
  "https://lcra-proxy.infinity0.workers.dev/",
  "https://lcra-proxy.onrender.com/",
];

function lcraProxies() {
  return shuffleArray(Array.from(LCRA_PROXY));
}

// these proxies uses special technqiues to bypasses Baidu's blocking of
// ordinary cloud services, which is what the above run on.
const LCRA_PROXY_BAIDU = [
  "https://pwned.gg/lcra-proxy/",
];

function lcraProxiesBaidu() {
  return shuffleArray(Array.from(LCRA_PROXY_BAIDU));
}