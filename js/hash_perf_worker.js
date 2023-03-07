"use strict";

self.importScripts( "hashliboo.js" );

const MiB = 4;
const buffer = new ArrayBuffer( MiB * 1024 * 1024 );

let hash;

self.onmessage = ( msg ) => {
    const args = msg.data;

    if( hash === undefined ) {
        let digest, variant;
        [ digest, variant ] = args.name.split( "-" );
        hash = DIGESTFACTORY.getInstance( digest, variant );
    }

    hash.init();
    let runTime = - performance.now();
    hash.add( buffer );
    runTime += performance.now();

    args.speed = MiB / ( runTime / 1000.0 );

    self.postMessage( args );
};
