"use strict";

let Print = ( what ) => print( what );
let Schedule = function( func, ...args ) { func( ...args ); };
let GetArg = function( index ) { return "" }; // dummy

if( typeof document == "object" )
{
    const stdout = document.getElementById( "stdout" );
    if( stdout !== null )
        Print = ( what ) => stdout.innerHTML += what + "\n";
    else
        Print = ( what ) => console.log( what );

    if( typeof setTimeout == "function" )
        Schedule = function( func, ...args ) { setTimeout( func, 0, ...args ); };
}

if( typeof scriptArgs == "object" )
{
    GetArg = function( index ) { return scriptArgs[index]; }
}
else if( typeof URLSearchParams == "function" ) {
    const params = new URLSearchParams( document.location.search );
    GetArg = function( index ) { return params.get( index.toString() ); };
}

function hexToNibble( hexChar ) {
    const c = hexChar.charCodeAt( 0 );
    if( c >= 0x30 && c <= 0x39 ) // '0'..'9'
        return c - 0x30;
    if( c >= 0x61 && c <= 0x66 ) // 'a'..'f'
        return ( c - 0x61 ) + 0x0A;
    if( c >= 0x41 && c <= 0x46 ) // 'A'..'F'
        return ( c - 0x41 ) + 0x0A;
    return 0;
}

function hexToBin( hexString ) {
    const A = new Uint8Array( hexString.length / 2 );
    A.forEach( ( e, i ) => {
        A[i] = ( hexToNibble( hexString[2 * i] ) << 4 )
            | hexToNibble( hexString[2 * i + 1] );
    } );
    return A.buffer;
}

function binToHex( arrayBuffer ) {
    let A = new Uint8Array( arrayBuffer );
    let hexString = "";
    A.forEach( ( item ) => {
        hexString += "0123456789abcdef"[( item >>> 4 ) & 0x0F]
            + "0123456789abcdef"[item & 0x0F];
    } );
    return hexString;
}

////////////////////////////////////////////////////////////////////////


// key: arrayBuffer, 16 bytes
function XTEA( key ) {

    // see https://en.wikipedia.org/wiki/XTEA

    this.name = "XTEA";

    const IS_LITTLE_ENDIAN = false;

    const N_ROUNDS = 32; // == 64 feistel rounds!
    const DELTA = 0x9E3779B9;

    const S0 = new Array( N_ROUNDS );
    const S1 = new Array( N_ROUNDS );

    function f( a ) {
        return ( ( a << 4 ) ^ ( a >>> 5 ) ) + a;
    }

    // in place encrypt
    // view: DataView, multiple of 8 byte blocks
//    this.encrypt = function( view ) {
    this.encrypt = ( view ) => {
        const endOfs = view.byteLength;
        for( let ofs = 0; ofs < endOfs; ofs += 8 ) {
            let x0 = view.getUint32( ofs    , IS_LITTLE_ENDIAN );
            let x1 = view.getUint32( ofs + 4, IS_LITTLE_ENDIAN );
            for( let i = 0; i < N_ROUNDS; i++ ) {
                x0 += f( x1 ) ^ S0[i]; x0 &= 0xFFFFFFFF;
                x1 += f( x0 ) ^ S1[i]; x1 &= 0xFFFFFFFF;
            }
            view.setUint32( ofs    , x0, IS_LITTLE_ENDIAN );
            view.setUint32( ofs + 4, x1, IS_LITTLE_ENDIAN );
        }
    };

    // in place decrypt
    // view: DataView, multiple of 8 byte blocks
//    this.decrypt = function( view ) {
    this.decrypt = ( view ) => {
        const endOfs = view.byteLength;
        for( let ofs = 0; ofs < endOfs; ofs += 8 ) {
            let x0 = view.getUint32( ofs    , IS_LITTLE_ENDIAN );
            let x1 = view.getUint32( ofs + 4, IS_LITTLE_ENDIAN );
            for( let i = N_ROUNDS - 1; i >= 0; i-- ) {
                x1 -= f( x0 ) ^ S1[i]; x1 &= 0xFFFFFFFF;
                x0 -= f( x1 ) ^ S0[i]; x0 &= 0xFFFFFFFF;
            }
            view.setUint32( ofs    , x0, IS_LITTLE_ENDIAN );
            view.setUint32( ofs + 4, x1, IS_LITTLE_ENDIAN );
        }
    };

    this.init = function( key ) {
//    this.init = ( key ) => {
        const KEY = new DataView( key );
        const K = [0, 1, 2, 3].map( ( i ) => KEY.getUint32( 4 * i, IS_LITTLE_ENDIAN ) );

        if( KEY.byteLength == 16 ) { // 128 bit
            let sum = 0;
            for( let i = 0; i < N_ROUNDS; i++ ) {
                S0[i] = ( sum + K[sum & 3] ) & 0xFFFFFFFF;
                sum = ( sum + DELTA ) & 0xFFFFFFFF;
                S1[i] = ( sum + K[( sum >>> 11 ) & 3] ) & 0xFFFFFFFF;
            }
        }
    };

    this.init( key );

    return this;
}

function performanceVerification( i, cipher ) {
    const TBL_PV = [
        { // [0]
            keyhex: "070e151c232a31383f464d545b626970",
            plainhex: "0000000000000000",
            crypthex: "69d180eafdc81f04"
        }, { // [1]
            keyhex: "777e858c939aa1a8afb6bdc4cbd2d9e0",
            plainhex: "69d180eafdc81f04",
            crypthex: "e285af3880941a44"
        }, { // [2]
            keyhex: "e7eef5fc030a11181f262d343b424950",
            plainhex: "e285af3880941a44",
            crypthex: "bd722cbb44a1b97c"
        }, { // [3]
            keyhex: "575e656c737a81888f969da4abb2b9c0",
            plainhex: "bd722cbb44a1b97c",
            crypthex: "e0f656c8bbf21870"
        }, { // [4]
            keyhex: "c7ced5dce3eaf1f8ff060d141b222930",
            plainhex: "e0f656c8bbf21870",
            crypthex: "1e1b21a12a2a02c8"
        }, { // [5]
            keyhex: "373e454c535a61686f767d848b9299a0",
            plainhex: "1e1b21a12a2a02c8",
            crypthex: "ee2bf14286ae9e05"
        }, { // [6]
            keyhex: "a7aeb5bcc3cad1d8dfe6edf4fb020910",
            plainhex: "ee2bf14286ae9e05",
            crypthex: "f940d4c7a0f0ee3c"
        }, { // [7]
            keyhex: "171e252c333a41484f565d646b727980",
            plainhex: "f940d4c7a0f0ee3c",
            crypthex: "e8904eff0b28d1e1"
        }, { // [8]
            keyhex: "878e959ca3aab1b8bfc6cdd4dbe2e9f0",
            plainhex: "e8904eff0b28d1e1",
            crypthex: "7357d7de900926d4"
        }, { // [9]
            keyhex: "f7fe050c131a21282f363d444b525960",
            plainhex: "7357d7de900926d4",
            crypthex: "a063b2e05e694a47"
        }, { // [10]
            keyhex: "676e757c838a91989fa6adb4bbc2c9d0",
            plainhex: "a063b2e05e694a47",
            crypthex: "25fc0d7bdbd6a4a1"
        }, { // [11]
            keyhex: "d7dee5ecf3fa01080f161d242b323940",
            plainhex: "25fc0d7bdbd6a4a1",
            crypthex: "ad5f63d0db5e82d4"
        }, { // [12]
            keyhex: "474e555c636a71787f868d949ba2a9b0",
            plainhex: "ad5f63d0db5e82d4",
            crypthex: "099939b38aa07da7"
        }, { // [13]
            keyhex: "b7bec5ccd3dae1e8eff6fd040b121920",
            plainhex: "099939b38aa07da7",
            crypthex: "c5d9d31a69ea09c3"
        }, { // [14]
            keyhex: "272e353c434a51585f666d747b828990",
            plainhex: "c5d9d31a69ea09c3",
            crypthex: "0c1ae1683ae91b3a"
        }, { // [15]
            keyhex: "979ea5acb3bac1c8cfd6dde4ebf2f900",
            plainhex: "0c1ae1683ae91b3a",
            crypthex: "e3647567f2bf418e"
        }, { // [16]
            keyhex: "070e151c232a31383f464d545b626970",
            plainhex: "e3647567f2bf418e",
            crypthex: "70ec70af7ec722bf"
        }, { // [17]
            keyhex: "777e858c939aa1a8afb6bdc4cbd2d9e0",
            plainhex: "70ec70af7ec722bf",
            crypthex: "6cb6ef12eca8fe57"
        }, { // [18]
            keyhex: "e7eef5fc030a11181f262d343b424950",
            plainhex: "6cb6ef12eca8fe57",
            crypthex: "8c45ab35f6d24574"
        }, { // [19]
            keyhex: "575e656c737a81888f969da4abb2b9c0",
            plainhex: "8c45ab35f6d24574",
            crypthex: "ef96f1801918b13b"
        }, { // [20]
            keyhex: "c7ced5dce3eaf1f8ff060d141b222930",
            plainhex: "ef96f1801918b13b",
            crypthex: "94826668672d8840"
        }, { // [21]
            keyhex: "373e454c535a61686f767d848b9299a0",
            plainhex: "94826668672d8840",
            crypthex: "02d99198dbad3e62"
        }, { // [22]
            keyhex: "a7aeb5bcc3cad1d8dfe6edf4fb020910",
            plainhex: "02d99198dbad3e62",
            crypthex: "4e31436f8dab6c53"
        }, { // [23]
            keyhex: "171e252c333a41484f565d646b727980",
            plainhex: "4e31436f8dab6c53",
            crypthex: "8218b864babc156f"
        }, { // [24]
            keyhex: "878e959ca3aab1b8bfc6cdd4dbe2e9f0",
            plainhex: "8218b864babc156f",
            crypthex: "04aff62cb60f6a42"
        }, { // [25]
            keyhex: "f7fe050c131a21282f363d444b525960",
            plainhex: "04aff62cb60f6a42",
            crypthex: "04cc4de609d705de"
        }, { // [26]
            keyhex: "676e757c838a91989fa6adb4bbc2c9d0",
            plainhex: "04cc4de609d705de",
            crypthex: "f45f8ae6fa6c104e"
        }, { // [27]
            keyhex: "d7dee5ecf3fa01080f161d242b323940",
            plainhex: "f45f8ae6fa6c104e",
            crypthex: "d2ba7b0b1e4e504d"
        }, { // [28]
            keyhex: "474e555c636a71787f868d949ba2a9b0",
            plainhex: "d2ba7b0b1e4e504d",
            crypthex: "3ff5ff91c7726f25"
        }, { // [29]
            keyhex: "b7bec5ccd3dae1e8eff6fd040b121920",
            plainhex: "3ff5ff91c7726f25",
            crypthex: "aebcac1f279fc554"
        }, { // [30]
            keyhex: "272e353c434a51585f666d747b828990",
            plainhex: "aebcac1f279fc554",
            crypthex: "53227f31bb320c7d"
        }, { // [31]
            keyhex: "979ea5acb3bac1c8cfd6dde4ebf2f900",
            plainhex: "53227f31bb320c7d",
            crypthex: "d244507960c5287f"
        }, { // [32]
            keyhex: "070e151c232a31383f464d545b626970",
            plainhex: "d244507960c5287f",
            crypthex: "f0af35368163180f"
        }, { // [33]
            keyhex: "777e858c939aa1a8afb6bdc4cbd2d9e0",
            plainhex: "f0af35368163180f",
            crypthex: "f3abe1035065449f"
        }, { // [34]
            keyhex: "e7eef5fc030a11181f262d343b424950",
            plainhex: "f3abe1035065449f",
            crypthex: "85a419921d4d8e3e"
        }, { // [35]
            keyhex: "575e656c737a81888f969da4abb2b9c0",
            plainhex: "85a419921d4d8e3e",
            crypthex: "df1d0c5bc586ad3e"
        }, { // [36]
            keyhex: "c7ced5dce3eaf1f8ff060d141b222930",
            plainhex: "df1d0c5bc586ad3e",
            crypthex: "02359b0068ff2f0e"
        }, { // [37]
            keyhex: "373e454c535a61686f767d848b9299a0",
            plainhex: "02359b0068ff2f0e",
            crypthex: "c4c2ece04b3477e4"
        }, { // [38]
            keyhex: "a7aeb5bcc3cad1d8dfe6edf4fb020910",
            plainhex: "c4c2ece04b3477e4",
            crypthex: "67104d37cd8ed5e2"
        }, { // [39]
            keyhex: "171e252c333a41484f565d646b727980",
            plainhex: "67104d37cd8ed5e2",
            crypthex: "b9e6b70a94c6185d"
        }, { // [40]
            keyhex: "878e959ca3aab1b8bfc6cdd4dbe2e9f0",
            plainhex: "b9e6b70a94c6185d",
            crypthex: "84a0e7d9dda66a96"
        }, { // [41]
            keyhex: "f7fe050c131a21282f363d444b525960",
            plainhex: "84a0e7d9dda66a96",
            crypthex: "563440d1288464af"
        }, { // [42]
            keyhex: "676e757c838a91989fa6adb4bbc2c9d0",
            plainhex: "563440d1288464af",
            crypthex: "df487d58029c21f0"
        }, { // [43]
            keyhex: "d7dee5ecf3fa01080f161d242b323940",
            plainhex: "df487d58029c21f0",
            crypthex: "f4d8e408031260c0"
        }, { // [44]
            keyhex: "474e555c636a71787f868d949ba2a9b0",
            plainhex: "f4d8e408031260c0",
            crypthex: "9abad16407c300ef"
        }, { // [45]
            keyhex: "b7bec5ccd3dae1e8eff6fd040b121920",
            plainhex: "9abad16407c300ef",
            crypthex: "33c02bff4bb8447e"
        }, { // [46]
            keyhex: "272e353c434a51585f666d747b828990",
            plainhex: "33c02bff4bb8447e",
            crypthex: "26530f8957b729df"
        }, { // [47]
            keyhex: "979ea5acb3bac1c8cfd6dde4ebf2f900",
            plainhex: "26530f8957b729df",
            crypthex: "9f708747e2dc2ac2"
        }, { // [48]
            keyhex: "070e151c232a31383f464d545b626970",
            plainhex: "9f708747e2dc2ac2",
            crypthex: "e593936f92fb0de7"
        }, { // [49]
            keyhex: "777e858c939aa1a8afb6bdc4cbd2d9e0",
            plainhex: "e593936f92fb0de7",
            crypthex: "10a1cea7d6e37d90"
        }, { // [50]
            keyhex: "e7eef5fc030a11181f262d343b424950",
            plainhex: "10a1cea7d6e37d90",
            crypthex: "a253f57921f36f5b"
        }, { // [51]
            keyhex: "575e656c737a81888f969da4abb2b9c0",
            plainhex: "a253f57921f36f5b",
            crypthex: "48d88f8b6d842a02"
        }, { // [52]
            keyhex: "c7ced5dce3eaf1f8ff060d141b222930",
            plainhex: "48d88f8b6d842a02",
            crypthex: "8306a80a552fb8c3"
        }, { // [53]
            keyhex: "373e454c535a61686f767d848b9299a0",
            plainhex: "8306a80a552fb8c3",
            crypthex: "531df870ccae2c42"
        }, { // [54]
            keyhex: "a7aeb5bcc3cad1d8dfe6edf4fb020910",
            plainhex: "531df870ccae2c42",
            crypthex: "de73cb5667cef0da"
        }, { // [55]
            keyhex: "171e252c333a41484f565d646b727980",
            plainhex: "de73cb5667cef0da",
            crypthex: "19f2a82524977f52"
        }, { // [56]
            keyhex: "878e959ca3aab1b8bfc6cdd4dbe2e9f0",
            plainhex: "19f2a82524977f52",
            crypthex: "3fb370815d29e64c"
        }, { // [57]
            keyhex: "f7fe050c131a21282f363d444b525960",
            plainhex: "3fb370815d29e64c",
            crypthex: "d8c001ccba5b46d8"
        }, { // [58]
            keyhex: "676e757c838a91989fa6adb4bbc2c9d0",
            plainhex: "d8c001ccba5b46d8",
            crypthex: "4478fe11f1fd29df"
        }, { // [59]
            keyhex: "d7dee5ecf3fa01080f161d242b323940",
            plainhex: "4478fe11f1fd29df",
            crypthex: "5c660d14ce34f95b"
        }
    ];

    const nIterations = 2048;

    let testtime = - performance.now();

    const index = TBL_PV.findIndex( ( item ) => {
        cipher.init( hexToBin( item.keyhex ) );

        let plain_e = new DataView( hexToBin( item.plainhex ) );
        let crypt_d = new DataView( hexToBin( item.crypthex ) );

        for( let j = 0; j < nIterations; j++ ) {
            cipher.encrypt( plain_e );
            cipher.decrypt( crypt_d );
        }

        return ( item.crypthex != binToHex( plain_e.buffer ) )
            || ( item.plainhex != binToHex( crypt_d.buffer ) );
    } );

    testtime += performance.now();

    Print( i + " XTEA pv "
        + (
            ( index != -1 )
            ? "FAIL at index " + index + " :-("
            : "OK (" + testtime.toFixed( 1 ) + " ms)"
        )
    );
}

// common instance for all benchmark() invocatons
const xtea = new XTEA( new ArrayBuffer( 16 ) );

// common buffer instance for all benchmark() invocatons
const MiB = 16;
const buffer = new DataView( new ArrayBuffer( MiB * 1024 * 1024 ) );

function benchmark( i, swapExecutionOrder ) {
    let runtime;

    if( swapExecutionOrder ) {
        runtime = - performance.now();
        xtea.decrypt( buffer );
        runtime += performance.now();
        Print( i + " XTEA decrypt: " + ( MiB / ( runtime / 1000.0 ) ).toFixed( 1 ) + " MiB/s" );

        runtime = - performance.now();
        xtea.encrypt( buffer );
        runtime += performance.now();
        Print( i + " XTEA encrypt: " + ( MiB / ( runtime / 1000.0 ) ).toFixed( 1 ) + " MiB/s" );
    }
    else {
        runtime = - performance.now();
        xtea.encrypt( buffer );
        runtime += performance.now();
        Print( i + " XTEA encrypt: " + ( MiB / ( runtime / 1000.0 ) ).toFixed( 1 ) + " MiB/s" );

        runtime = - performance.now();
        xtea.decrypt( buffer );
        runtime += performance.now();
        Print( i + " XTEA decrypt: " + ( MiB / ( runtime / 1000.0 ) ).toFixed( 1 ) + " MiB/s" );
    }
};

////////////////////////////////////////////////////////////////////////

const swapExecutionOrder = ( GetArg( 0 ) == "swap" );

let i = 1;

Schedule( benchmark, i++, swapExecutionOrder  );
Schedule( benchmark, i++, swapExecutionOrder  );

Schedule( performanceVerification, i++, xtea );

Schedule( benchmark, i++, ! swapExecutionOrder  );
Schedule( benchmark, i++, ! swapExecutionOrder  );
