const { GET } = require('./src/app/api/performance/equity-curve/route');

async function run() {
  try {
    const req = { url: 'http://localhost:3000/api/performance/equity-curve?range=ALL' };
    const res = await GET(req);
    const json = await res.json();
    console.log("STATUS:", res.status);
    console.log("DATA:", json);
  } catch (e) {
    console.error("FATAL ERROR:", e);
  }
}

run();
