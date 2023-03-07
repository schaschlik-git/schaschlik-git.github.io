---
layout: default
---
<style>
    th, td {
        text-align: center;
        min-width: 3em;
    }
</style>
# JavaScript hash digest performance

- hash digest performance being measured on your machine in real time
- utilizes up to all of your machine's available cores / threads (depends on
  [hardwareConcurrency](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency)
  availability)
- compares performance of different hash algorithms implemented in pure
  JavaScript, as well as their 'mini' and 'unrolled' implementation variants
- also demonstrates just-in-time (JIT) compilation / optimization behaviour
  of your browser's JavaScript engine
- requires a not too matured internet browser / JavaScript engine to see
  results (say vintage 2018 and younger - time to remove the cobwebs)
- please press START button below to begin the measurement

<form><button id="hash_perf_button" type="button">START</button></form>
<div id="hash_perf_tbl"></div>
<script src="js/hash_perf_tbl.js"></script>

# some (random) annotations
- each hash digest implementation above (a.k.a. table row) runs in a
  seperate [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- each run above (a.k.a. table column) "digests" a 4 MiB chunk of all
  zero bytes
- measurement accuracy / reproducibility depends on
  [performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)
  readings being not "too far off" in each web worker instance and also
  being uninterrupted by internal JavaScript engine garbage collection
  (GC) and/or JIT events, plus machine utilization in general is a factor
- since SHA512 and BLAKE2b family of hashes work with 64 bit integer
  operations and JavaScript only supports some kind of 32 bit integer
  natively, there are massive performance penalties to be observed,
  naturally
- some 'unrolled' implementations in
  [hashliboo.js](https://github.com/schaschlik-git/schaschlik-git.github.io/blob/main/js/hashliboo.js) may seem a bit
  excessive, but the performance results are still interesting, though - imho

# hashliboo.js usage example

```js
// instantiate MD5 object
const md5 = new MD5( MINI_CODE );
// or
const md5 = DIGESTFACTORY.getInstance( "MD5", "mini" );

// optionally verify MD5 digest performing correctly on client
// browser's JavaScript engine
const isTrustWorthy = md5.verify(); // returns either true or false

// add new data incrementally (type: ArrayBuffer)
md5.add( buffer );

md5.add( nextChunk )
    .add( yetAnotherChunk );

// finish 'digesting'
const md5hex = md5.toHex(); // returns lowercase hexadecimal string
// and / or
const md5bin = md5.toBin(); // returns ArrayBuffer

// to re-use md5 instance do
md5.init();

// and again
md5.add( unrelatedBuffer );

// and remember: MD5 is cryptographically INSECURE
```
