"use strict";

// can also be run with javascript console application:
// Mozilla's "SpiderMonkey": '$ js hashliboo.js'
// Chromium's "V8": '$ d8 hashliboo.js'

const Print = ( console === undefined )
    ? ( text ) => print( text )
    : ( text ) => console.log( text );

// do startup performance (and correctness) verification only when
// running outside browser environment
const doStartupPV = ( console === undefined );
const globalNoPVSpeedTest = false;

// ( more ) meaningful translation of some boolean function arguments
const MINI_CODE = false;    // 'unrolled' = false
const UNROLLED_CODE = true; // 'unrolled' = true
const NO_SPEED_TEST = true; // 'noSpeedTest' = true

const LITTLE_ENDIAN = true; // 'littleEndian' = true;
const BIG_ENDIAN = false;   // 'littleEndian' = false;

/**********************************************************************/

// class UINT64
const UINT64 = ( function() {

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function ( hi, lo ) {
        this.hi = hi;
        this.lo = lo;
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.init = function( a ) {
        this.hi = a.hi;
        this.lo = a.lo;

        return this;
    };

    thisClass.prototype.init2 = function( hi, lo ) {
        this.hi = hi;
        this.lo = lo;

        return this;
    };

    thisClass.prototype.invert = function() {
        this.hi = ~ this.hi;
        this.lo = ~ this.lo;

        return this;
    };
    thisClass.prototype.and = function( a ) {
        this.hi &= a.hi;
        this.lo &= a.lo;

        return this;
    };
    thisClass.prototype.or = function( a ) {
        this.hi |= a.hi;
        this.lo |= a.lo;

        return this;
    };
    thisClass.prototype.xor = function( a ) {
        this.hi ^= a.hi;
        this.lo ^= a.lo;

        return this;
    };

    thisClass.prototype.add = function( a ) {
        const t31 = ( this.lo & 0x8000_0000 ) != 0;
        const a31 = ( a.lo & 0x8000_0000 ) != 0 ;
        const carry31 = ( ( ( this.lo & 0x7FFF_FFFF ) + ( a.lo & 0x7FFF_FFFF ) )
            & 0x8000_0000 ) != 0;

        this.lo += a.lo;
        this.hi += a.hi;
        if( ( carry31 + t31 + a31 ) > 1 )
            this.hi++;

        this.hi &= 0xFFFF_FFFF; // force 32 bit integer !!!
        this.lo &= 0xFFFF_FFFF; // force 32 bit integer !!!

        return this;
    };

    thisClass.prototype.ror = function( a ) {
        a &= 63;
        if( a >= 32 ) {
            const tmp = this.lo; this.lo = this.hi; this.hi = tmp;
            a -= 32;
        }
        if( ( a > 0 ) && ( a < 32 ) ) {
            const hi = this.hi, lo = this.lo;
            this.lo = ( lo >>> a ) | ( ( hi << ( 32 - a ) ) );
            this.hi = ( hi >>> a ) | ( lo << ( 32 - a ) );
        }

        return this;
    };

    thisClass.prototype.shr = function( a ) {
        if( a < 32 ) {
            if( a > 0 )
                this.lo = ( this.lo >>> a ) | ( this.hi << ( 32 - a ) );
            this.hi >>>= a;
        }
        else {
            this.lo = ( a < 64 ) ? this.hi >>> ( a - 32 ) : 0;
            this.hi = 0;
        }

        return this;
    };

    thisClass.prototype.hex = function() {
        function u8ToHexStr( u8 ) {
            return "0123456789abcdef"[( u8 >>> 4 ) & 0x0F]
                + "0123456789abcdef"[u8 & 0x0F];
        }

        function u32ToHexStrBE( u32 ) {
            return u8ToHexStr( u32 >>> 24 )
                + u8ToHexStr( u32 >>> 16 )
                + u8ToHexStr( u32 >>> 8 )
                + u8ToHexStr( u32 );
        }

        return u32ToHexStrBE( this.hi ) +  u32ToHexStrBE( this.lo );
    };

    ////////////////////////////////////////////////////////////////////
    // static class members / methods

    thisClass.zero = function() {
        return new UINT64( 0, 0 );
    }

    return thisClass;
} )();

/**********************************************************************/

// abstract class HASH
const HASH = ( function() {

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const verifyData = [
        /* 0 */ "",
        /* 1 */ "a",
        /* 2 */ "abc",
        /* 3 */ "\x55".repeat( 56 ),
        /* 4 */ "\xaa".repeat( 112 ),
        /* 5 */ "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 ),
        /* 6 */ "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
//      /* 7 */ "\x00".repeat( 8 * 1024 * 1024 )
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function ( blockSize ) {
        this.blockSize = blockSize;

        // subclass NEEDS to call this.init() - DON'T EVER FORGET
        // this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    // abstract
    // view: DataView, ofs: byte offset into view
    thisClass.prototype.doBlock = function( view, ofs ) { throw "abstract"; }

    // abstract
    thisClass.prototype.finalize = function() { throw "abstract"; }

    // abstract
    thisClass.prototype.pad = function() { throw "abstract"; }

    thisClass.prototype.getName = () => "HASH";

    thisClass.prototype.init = function() {
        this.byteLength = 0;
        this.remains = new ArrayBuffer( 0 );
        this.hash = null;
    };

    // buffer: ArrayBuffer
    thisClass.prototype.add = function( buffer ) {
        let bufferOfs = 0;
        const bufferView = new DataView( buffer );

        let size = this.remains.byteLength + buffer.byteLength;

        if( this.remains.byteLength < this.blockSize ) {
            const remainsView = new DataView( this.remains );
            const newRemains = new Uint8Array( Math.min( this.blockSize, size ) );
            let i = 0, j = 0;

            while( j < remainsView.byteLength )
                newRemains[i++] = remainsView.getUint8( j++ );

            while( i < newRemains.byteLength )
                newRemains[i++] = bufferView.getUint8( bufferOfs++ );

            this.remains = newRemains.buffer;

            if( this.remains.byteLength < this.blockSize )
                return this;
        }

        // arriving here `this.remains.byteLength` always equals `this.blockSize`

        // want to keep a non-empty remains buffer
        if( buffer.byteLength - bufferOfs > 0 ) {
            // process full remains block
            this.doBlock( new DataView( this.remains ), 0 );
            this.byteLength += this.blockSize;

            while( buffer.byteLength - bufferOfs > this.blockSize ) {
                this.doBlock( bufferView, bufferOfs );
                this.byteLength += this.blockSize;
                bufferOfs += this.blockSize;
            }

            this.remains = buffer.slice( bufferOfs );
        }

        return this;
    };

    thisClass.prototype.finish = function() {
        if( this.hash !== null )
            return this;

        // apply padding to last data block
        this.add( this.pad() );

        if( this.remains.byteLength != this.blockSize )
            throw "FUCK!";

        // flush remains buffer
        this.doBlock( new DataView( this.remains ), 0 );

        this.finalize();

        return this;
    };

    thisClass.prototype.toBin = function() {
        this.finish();
        return this.hash.slice(); // returning a true copy!
    };

    thisClass.prototype.toHex = function() {
        let hex = "";
        ( new Uint8Array( this.toBin() ) ).forEach( ( item ) => {
            hex += "0123456789abcdef"[( item >>> 4 ) & 0x0F]
                + "0123456789abcdef"[item & 0x0F];
        } );
        return hex;
    };

    const singleByte = new Uint8Array( 1 );
    function addData( hashInstance, data, bytewise ) {
        const bytes = Uint8Array.from( data, ( c ) => c.charCodeAt( 0 ) );
        if( bytewise ) {
            for( let i = 0; i < bytes.byteLength; i++ ) {
                singleByte[0] = bytes[i];
                hashInstance.add( singleByte.buffer );
            }
        }
        else
            hashInstance.add( bytes.buffer );
    }

    // hashRef: Map of ( verifyData index, hash hex string ) pairs
    thisClass.prototype.verify = function( hashRef ) {
        for( const [ index, ref ] of hashRef ) {
            // omit verifcation of last hasRef entry
            // "\x00".repeat( 8 * 1024 * 1024 )
            if( index == 7 ) {
                this.ref8MiBzeros = ref;
                break;
            }
            this.init();
            addData( this, verifyData[index], false );
            const hash = this.toHex();
            if( hash != ref ) {
                Print( hash + " != " + ref );
                return false;
            }
        }

        return true;
    };

    let Buffer;

    thisClass.prototype.speed = function( buffer ) {
        if( buffer === undefined ) {
            if( Buffer === undefined  ) {
                const MiB = 8;
                Buffer = new ArrayBuffer( MiB * 1024 * 1024 );
            }
            buffer = Buffer;
        }

        this.init();
        let time = - performance.now(); // milliseconds
        this.add( buffer );
        time += performance.now();
        const refHex = this.ref8MiBzeros;
        if( buffer === Buffer && refHex != "" ) {
            const hex = this.toHex();
            if( hex != refHex ) {
                Print( this.getName() + ": 8 MiB all zeros FAILED!" );
                Print( hex + " != " + refHex );
            }
        }
        return buffer.byteLength / ( time * 1024 * 1024 / 1000.0 ); // MiB/s
    };

    // performance verification
    thisClass.prototype.pv = function( noSpeedTest ) {
        if( ! this.verify() ) {
            Print( this.getName() + " verify: failed" );
            return;
        }

        if( noSpeedTest )
            return;

        Print( this.getName() + " speed: "
            + this.speed().toFixed( 1 ) + " MiB/s" );

    };

    return thisClass;
} )();

/**********************************************************************/

// abstract class PADDING_LE
const PADDING_LE = ( function() {

    const superClass = HASH;

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function () {
        // nothing to do here
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.pad = function() {
        this.byteLength += this.remains.byteLength;
        let padSize = this.blockSize - this.remains.byteLength;
        if( padSize < 9 )
            padSize += this.blockSize;
        const padView = new DataView( new ArrayBuffer( padSize ) );
        padView.setUint8( 0, 0x80 );
        const bitLength = this.byteLength * 2**3;

        // assuming Number.isSafeInteger( bitLength ) to be true!
        padView.setUint32( padView.byteLength - 8,
            bitLength & 0xFFFF_FFFF, LITTLE_ENDIAN );
        padView.setUint32( padView.byteLength - 4,
            ( bitLength / 2**32 ) & 0xFFFF_FFFF, LITTLE_ENDIAN );

        return padView.buffer;
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    return thisClass;
} )();

/**********************************************************************/

// abstract class PADDING_BE
const PADDING_BE = ( function() {

    const superClass = HASH;

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function () {
        // nothing to do here
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.pad = function() {
        this.byteLength += this.remains.byteLength;
        let padSize = this.blockSize - this.remains.byteLength;
        const bitLengthFieldSize = this.blockSize / 8;
        if( padSize < ( 1 + bitLengthFieldSize ) )
            padSize += this.blockSize;
        const padView = new DataView( new ArrayBuffer( padSize ) );
        padView.setUint8( 0, 0x80 );
        const bitLength = this.byteLength * 2**3;

        // assuming Number.isSafeInteger( bitLength ) to be true!
        padView.setUint32( padView.byteLength - 8,
            ( bitLength / 2**32 ) & 0xFFFF_FFFF, BIG_ENDIAN );
        padView.setUint32( padView.byteLength - 4,
            bitLength & 0xFFFF_FFFF, BIG_ENDIAN );

        return padView.buffer;
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    return thisClass;
} )();

/**********************************************************************/

// class MD5
// CRYPTOGRAPHICALLY INSECURE
const MD5 = ( function() {

    const superClass = PADDING_LE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 16;

    const md5ref = new Map( [
        // ""
        [ 0, "d41d8cd98f00b204e9800998ecf8427e" ],
        // "a"
        [ 1, "0cc175b9c0f1b6a831c399e269772661" ],
        // "abc"
        [ 2, "900150983cd24fb0d6963f7d28e17f72" ],
        // "\x55".repeat( 56 )
        [ 3, "39b1d9070bdafbfec1c0f5ca1fefe27e" ],
        // "\xaa".repeat( 112 )
        [ 4, "67f22a01975b684d76181bf549317a24" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "d3e718f99a9fbfce02162144b47a6049" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "9f8b217e6b41ccd5e8d0793ad2c0a1f5" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "96995b58d4cbf6aaa9041b4f00c7f6ae" ],
    ] );

    const K = [
        0xD76A_A478, 0xE8C7_B756, 0x2420_70DB, 0xC1BD_CEEE, 0xF57C_0FAF, 0x4787_C62A, 0xA830_4613, 0xFD46_9501,
        0x6980_98D8, 0x8B44_F7AF, 0xFFFF_5BB1, 0x895C_D7BE, 0x6B90_1122, 0xFD98_7193, 0xA679_438E, 0x49B4_0821,
        0xF61E_2562, 0xC040_B340, 0x265E_5A51, 0xE9B6_C7AA, 0xD62F_105D, 0x0244_1453, 0xD8A1_E681, 0xE7D3_FBC8,
        0x21E1_CDE6, 0xC337_07D6, 0xF4D5_0D87, 0x455A_14ED, 0xA9E3_E905, 0xFCEF_A3F8, 0x676F_02D9, 0x8D2A_4C8A,
        0xFFFA_3942, 0x8771_F681, 0x6D9D_6122, 0xFDE5_380C, 0xA4BE_EA44, 0x4BDE_CFA9, 0xF6BB_4B60, 0xBEBF_BC70,
        0x289B_7EC6, 0xEAA1_27FA, 0xD4EF_3085, 0x0488_1D05, 0xD9D4_D039, 0xE6DB_99E5, 0x1FA2_7CF8, 0xC4AC_5665,
        0xF429_2244, 0x432A_FF97, 0xAB94_23A7, 0xFC93_A039, 0x655B_59C3, 0x8F0C_CC92, 0xFFEF_F47D, 0x8584_5DD1,
        0x6FA8_7E4F, 0xFE2C_E6E0, 0xA301_4314, 0x4E08_11A1, 0xF753_7E82, 0xBD3A_F235, 0x2AD7_D2BB, 0xEB86_D391
    ];

    const I = [
        0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
        1,  6, 11,  0,  5, 10, 15,  4,  9, 14,  3,  8, 13,  2,  7, 12,
        5,  8, 11, 14,  1,  4,  7, 10, 13,  0,  3,  6,  9, 12, 15,  2,
        0,  7, 14,  5, 12,  3, 10,  1,  8, 15,  6, 13,  4, 11,  2,  9
    ];

    const R = [
        7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
        5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
        4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
        6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
    ];

    function f0( a, b, c ) {
//      return ( a & b ) | ( ( ~a ) & c );
        return ( c ^ ( a & ( b ^ c ) ) );
    }

    function f1( a, b, c ) {
//      return ( a & c ) | ( b & ( ~c ) );
        return ( b ^ ( c & ( a ^ b ) ) );
    }

    function f2( a, b, c ) {
        return a ^ b ^ c;
    }

    function f3( a, b, c ) {
        return b ^ ( a | ( ~c ) );
    }

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    const FUNC = [ f0, f1, f2, f3 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_LE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let H0, H1, H2, H3;

        let className = "MD5";

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3;

                A = B + rol( A + f0( B, C, D ) + 0xD76A_A478 +  X0,  7 );
                D = A + rol( D + f0( A, B, C ) + 0xE8C7_B756 +  X1, 12 );
                C = D + rol( C + f0( D, A, B ) + 0x2420_70DB +  X2, 17 );
                B = C + rol( B + f0( C, D, A ) + 0xC1BD_CEEE +  X3, 22 );
                A = B + rol( A + f0( B, C, D ) + 0xF57C_0FAF +  X4,  7 );
                D = A + rol( D + f0( A, B, C ) + 0x4787_C62A +  X5, 12 );
                C = D + rol( C + f0( D, A, B ) + 0xA830_4613 +  X6, 17 );
                B = C + rol( B + f0( C, D, A ) + 0xFD46_9501 +  X7, 22 );
                A = B + rol( A + f0( B, C, D ) + 0x6980_98D8 +  X8,  7 );
                D = A + rol( D + f0( A, B, C ) + 0x8B44_F7AF +  X9, 12 );
                C = D + rol( C + f0( D, A, B ) + 0xFFFF_5BB1 + X10, 17 );
                B = C + rol( B + f0( C, D, A ) + 0x895C_D7BE + X11, 22 );
                A = B + rol( A + f0( B, C, D ) + 0x6B90_1122 + X12,  7 );
                D = A + rol( D + f0( A, B, C ) + 0xFD98_7193 + X13, 12 );
                C = D + rol( C + f0( D, A, B ) + 0xA679_438E + X14, 17 );
                B = C + rol( B + f0( C, D, A ) + 0x49B4_0821 + X15, 22 );

                A = B + rol( A + f1( B, C, D ) + 0xF61E_2562 +  X1,  5 );
                D = A + rol( D + f1( A, B, C ) + 0xC040_B340 +  X6,  9 );
                C = D + rol( C + f1( D, A, B ) + 0x265E_5A51 + X11, 14 );
                B = C + rol( B + f1( C, D, A ) + 0xE9B6_C7AA +  X0, 20 );
                A = B + rol( A + f1( B, C, D ) + 0xD62F_105D +  X5,  5 );
                D = A + rol( D + f1( A, B, C ) + 0x0244_1453 + X10,  9 );
                C = D + rol( C + f1( D, A, B ) + 0xD8A1_E681 + X15, 14 );
                B = C + rol( B + f1( C, D, A ) + 0xE7D3_FBC8 +  X4, 20 );
                A = B + rol( A + f1( B, C, D ) + 0x21E1_CDE6 +  X9,  5 );
                D = A + rol( D + f1( A, B, C ) + 0xC337_07D6 + X14,  9 );
                C = D + rol( C + f1( D, A, B ) + 0xF4D5_0D87 +  X3, 14 );
                B = C + rol( B + f1( C, D, A ) + 0x455A_14ED +  X8, 20 );
                A = B + rol( A + f1( B, C, D ) + 0xA9E3_E905 + X13,  5 );
                D = A + rol( D + f1( A, B, C ) + 0xFCEF_A3F8 +  X2,  9 );
                C = D + rol( C + f1( D, A, B ) + 0x676F_02D9 +  X7, 14 );
                B = C + rol( B + f1( C, D, A ) + 0x8D2A_4C8A + X12, 20 );

                A = B + rol( A + f2( B, C, D ) + 0xFFFA_3942 +  X5,  4 );
                D = A + rol( D + f2( A, B, C ) + 0x8771_F681 +  X8, 11 );
                C = D + rol( C + f2( D, A, B ) + 0x6D9D_6122 + X11, 16 );
                B = C + rol( B + f2( C, D, A ) + 0xFDE5_380C + X14, 23 );
                A = B + rol( A + f2( B, C, D ) + 0xA4BE_EA44 +  X1,  4 );
                D = A + rol( D + f2( A, B, C ) + 0x4BDE_CFA9 +  X4, 11 );
                C = D + rol( C + f2( D, A, B ) + 0xF6BB_4B60 +  X7, 16 );
                B = C + rol( B + f2( C, D, A ) + 0xBEBF_BC70 + X10, 23 );
                A = B + rol( A + f2( B, C, D ) + 0x289B_7EC6 + X13,  4 );
                D = A + rol( D + f2( A, B, C ) + 0xEAA1_27FA +  X0, 11 );
                C = D + rol( C + f2( D, A, B ) + 0xD4EF_3085 +  X3, 16 );
                B = C + rol( B + f2( C, D, A ) + 0x0488_1D05 +  X6, 23 );
                A = B + rol( A + f2( B, C, D ) + 0xD9D4_D039 +  X9,  4 );
                D = A + rol( D + f2( A, B, C ) + 0xE6DB_99E5 + X12, 11 );
                C = D + rol( C + f2( D, A, B ) + 0x1FA2_7CF8 + X15, 16 );
                B = C + rol( B + f2( C, D, A ) + 0xC4AC_5665 +  X2, 23 );

                A = B + rol( A + f3( B, C, D ) + 0xF429_2244 +  X0,  6 );
                D = A + rol( D + f3( A, B, C ) + 0x432A_FF97 +  X7, 10 );
                C = D + rol( C + f3( D, A, B ) + 0xAB94_23A7 + X14, 15 );
                B = C + rol( B + f3( C, D, A ) + 0xFC93_A039 +  X5, 21 );
                A = B + rol( A + f3( B, C, D ) + 0x655B_59C3 + X12,  6 );
                D = A + rol( D + f3( A, B, C ) + 0x8F0C_CC92 +  X3, 10 );
                C = D + rol( C + f3( D, A, B ) + 0xFFEF_F47D + X10, 15 );
                B = C + rol( B + f3( C, D, A ) + 0x8584_5DD1 +  X1, 21 );
                A = B + rol( A + f3( B, C, D ) + 0x6FA8_7E4F +  X8,  6 );
                D = A + rol( D + f3( A, B, C ) + 0xFE2C_E6E0 + X15, 10 );
                C = D + rol( C + f3( D, A, B ) + 0xA301_4314 +  X6, 15 );
                B = C + rol( B + f3( C, D, A ) + 0x4E08_11A1 + X13, 21 );
                A = B + rol( A + f3( B, C, D ) + 0xF753_7E82 +  X4,  6 );
                D = A + rol( D + f3( A, B, C ) + 0xBD3A_F235 + X11, 10 );
                C = D + rol( C + f3( D, A, B ) + 0x2AD7_D2BB +  X2, 15 );
                B = C + rol( B + f3( C, D, A ) + 0xEB86_D391 +  X9, 21 );

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
            }
        }
        else {
            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            className += "-mini";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3;

                for( let i = 0; i < 64; i++ ) {
                    A = B + rol( A + FUNC[i >>> 4]( B, C, D ) + K[i] + X[I[i]], R[i] );
                    const tmp = A; A = D; D = C; C = B; B = tmp;
                }

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
            }
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, md5ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class RIPEMD128
const RIPEMD128 = ( function() {

    const superClass = PADDING_LE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 16;

    const ripemd128ref = new Map( [
        // ""
        [ 0, "cdf26213a150dc3ecb610f18f6b38b46" ],
        // "a"
        [ 1, "86be7afa339d0fc7cfc785e72f578d33" ],
        // "abc"
        [ 2, "c14a12199c66e4ba84636b0f69144c77" ],
        // "\x55".repeat( 56 )
        [ 3, "0d8cf3c5b1bdb3d7205058acf422648d" ],
        // "\xaa".repeat( 112 )
        [ 4, "d645c83eebdbe6f4d0f59564ddde8dfd" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "a12fef64868f64b21584caa984946851" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "68c7ee332322032694ff12b74a6898fa" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "fe2b1807dde5fef320c5addbe288904f" ]
    ] );

    const K1  = 0x5A82_7999, K2  = 0x6ED9_EBA1, K3  = 0x8F1B_BCDC,
          K1_ = 0x6D70_3EF3, K2_ = 0x5C4D_D124, K3_ = 0x50A2_8BE6;

    const K  = [ 0x0000_0000, K1, K2, K3 ];

    const R = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2
    ];

    const S = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12
    ];

    const K_ = [ K3_, K2_, K1_, 0x0000_0000 ];

    const R_ = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14
    ];

    const S_ = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8
    ];

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    function f0( a, b, c ) {
        return a ^ b ^ c;
    }

    function f1( a, b, c ) {
//      return ( a & b ) | ( ( ~a ) & c );
        return ( c ^ ( a & ( b ^ c ) ) );
    }

    function f2( a, b, c ) {
        return ( a | ( ~b ) ) ^ c;
    }

    function f3( a, b, c ) {
//      return ( a & c ) | ( b & ( ~c ) );
        return ( b ^ ( c & ( a ^ b ) ) );
    }

    const FUNC = [ f0, f1, f2, f3 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_LE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let H0, H1, H2, H3;

        let className = "RIPEMD128";

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3;

                A = rol( A + f0( B, C, D ) +       X0, 11 );
                D = rol( D + f0( A, B, C ) +       X1, 14 );
                C = rol( C + f0( D, A, B ) +       X2, 15 );
                B = rol( B + f0( C, D, A ) +       X3, 12 );
                A = rol( A + f0( B, C, D ) +       X4,  5 );
                D = rol( D + f0( A, B, C ) +       X5,  8 );
                C = rol( C + f0( D, A, B ) +       X6,  7 );
                B = rol( B + f0( C, D, A ) +       X7,  9 );
                A = rol( A + f0( B, C, D ) +       X8, 11 );
                D = rol( D + f0( A, B, C ) +       X9, 13 );
                C = rol( C + f0( D, A, B ) +      X10, 14 );
                B = rol( B + f0( C, D, A ) +      X11, 15 );
                A = rol( A + f0( B, C, D ) +      X12,  6 );
                D = rol( D + f0( A, B, C ) +      X13,  7 );
                C = rol( C + f0( D, A, B ) +      X14,  9 );
                B = rol( B + f0( C, D, A ) +      X15,  8 );

                A = rol( A + f1( B, C, D ) + K1 +  X7,  7 );
                D = rol( D + f1( A, B, C ) + K1 +  X4,  6 );
                C = rol( C + f1( D, A, B ) + K1 + X13,  8 );
                B = rol( B + f1( C, D, A ) + K1 +  X1, 13 );
                A = rol( A + f1( B, C, D ) + K1 + X10, 11 );
                D = rol( D + f1( A, B, C ) + K1 +  X6,  9 );
                C = rol( C + f1( D, A, B ) + K1 + X15,  7 );
                B = rol( B + f1( C, D, A ) + K1 +  X3, 15 );
                A = rol( A + f1( B, C, D ) + K1 + X12,  7 );
                D = rol( D + f1( A, B, C ) + K1 +  X0, 12 );
                C = rol( C + f1( D, A, B ) + K1 +  X9, 15 );
                B = rol( B + f1( C, D, A ) + K1 +  X5,  9 );
                A = rol( A + f1( B, C, D ) + K1 +  X2, 11 );
                D = rol( D + f1( A, B, C ) + K1 + X14,  7 );
                C = rol( C + f1( D, A, B ) + K1 + X11, 13 );
                B = rol( B + f1( C, D, A ) + K1 +  X8, 12 );

                A = rol( A + f2( B, C, D ) + K2 +  X3, 11 );
                D = rol( D + f2( A, B, C ) + K2 + X10, 13 );
                C = rol( C + f2( D, A, B ) + K2 + X14,  6 );
                B = rol( B + f2( C, D, A ) + K2 +  X4,  7 );
                A = rol( A + f2( B, C, D ) + K2 +  X9, 14 );
                D = rol( D + f2( A, B, C ) + K2 + X15,  9 );
                C = rol( C + f2( D, A, B ) + K2 +  X8, 13 );
                B = rol( B + f2( C, D, A ) + K2 +  X1, 15 );
                A = rol( A + f2( B, C, D ) + K2 +  X2, 14 );
                D = rol( D + f2( A, B, C ) + K2 +  X7,  8 );
                C = rol( C + f2( D, A, B ) + K2 +  X0, 13 );
                B = rol( B + f2( C, D, A ) + K2 +  X6,  6 );
                A = rol( A + f2( B, C, D ) + K2 + X13,  5 );
                D = rol( D + f2( A, B, C ) + K2 + X11, 12 );
                C = rol( C + f2( D, A, B ) + K2 +  X5,  7 );
                B = rol( B + f2( C, D, A ) + K2 + X12,  5 );

                A = rol( A + f3( B, C, D ) + K3 +  X1, 11 );
                D = rol( D + f3( A, B, C ) + K3 +  X9, 12 );
                C = rol( C + f3( D, A, B ) + K3 + X11, 14 );
                B = rol( B + f3( C, D, A ) + K3 + X10, 15 );
                A = rol( A + f3( B, C, D ) + K3 +  X0, 14 );
                D = rol( D + f3( A, B, C ) + K3 +  X8, 15 );
                C = rol( C + f3( D, A, B ) + K3 + X12,  9 );
                B = rol( B + f3( C, D, A ) + K3 +  X4,  8 );
                A = rol( A + f3( B, C, D ) + K3 + X13,  9 );
                D = rol( D + f3( A, B, C ) + K3 +  X3, 14 );
                C = rol( C + f3( D, A, B ) + K3 +  X7,  5 );
                B = rol( B + f3( C, D, A ) + K3 + X15,  6 );
                A = rol( A + f3( B, C, D ) + K3 + X14,  8 );
                D = rol( D + f3( A, B, C ) + K3 +  X5,  6 );
                C = rol( C + f3( D, A, B ) + K3 +  X6,  5 );
                B = rol( B + f3( C, D, A ) + K3 +  X2, 12 );

                let A_ = H0, B_ = H1, C_ = H2, D_ = H3;

                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X5,  8 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ + X14,  9 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ +  X7,  9 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X0, 11 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X9, 13 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ +  X2, 15 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ + X11, 15 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X4,  5 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ + X13,  7 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ +  X6,  7 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ + X15,  8 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X8, 11 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X1, 14 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ + X10, 14 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ +  X3, 12 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ + X12,  6 );

                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ +  X6,  9 );
                D_ = rol( D_ + f2( A_, B_, C_ ) + K2_ + X11, 13 );
                C_ = rol( C_ + f2( D_, A_, B_ ) + K2_ +  X3, 15 );
                B_ = rol( B_ + f2( C_, D_, A_ ) + K2_ +  X7,  7 );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ +  X0, 12 );
                D_ = rol( D_ + f2( A_, B_, C_ ) + K2_ + X13,  8 );
                C_ = rol( C_ + f2( D_, A_, B_ ) + K2_ +  X5,  9 );
                B_ = rol( B_ + f2( C_, D_, A_ ) + K2_ + X10, 11 );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ + X14,  7 );
                D_ = rol( D_ + f2( A_, B_, C_ ) + K2_ + X15,  7 );
                C_ = rol( C_ + f2( D_, A_, B_ ) + K2_ +  X8, 12 );
                B_ = rol( B_ + f2( C_, D_, A_ ) + K2_ + X12,  7 );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ +  X4,  6 );
                D_ = rol( D_ + f2( A_, B_, C_ ) + K2_ +  X9, 15 );
                C_ = rol( C_ + f2( D_, A_, B_ ) + K2_ +  X1, 13 );
                B_ = rol( B_ + f2( C_, D_, A_ ) + K2_ +  X2, 11 );

                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ + X15,  9 );
                D_ = rol( D_ + f1( A_, B_, C_ ) + K1_ +  X5,  7 );
                C_ = rol( C_ + f1( D_, A_, B_ ) + K1_ +  X1, 15 );
                B_ = rol( B_ + f1( C_, D_, A_ ) + K1_ +  X3, 11 );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ +  X7,  8 );
                D_ = rol( D_ + f1( A_, B_, C_ ) + K1_ + X14,  6 );
                C_ = rol( C_ + f1( D_, A_, B_ ) + K1_ +  X6,  6 );
                B_ = rol( B_ + f1( C_, D_, A_ ) + K1_ +  X9, 14 );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ + X11, 12 );
                D_ = rol( D_ + f1( A_, B_, C_ ) + K1_ +  X8, 13 );
                C_ = rol( C_ + f1( D_, A_, B_ ) + K1_ + X12,  5 );
                B_ = rol( B_ + f1( C_, D_, A_ ) + K1_ +  X2, 14 );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ + X10, 13 );
                D_ = rol( D_ + f1( A_, B_, C_ ) + K1_ +  X0, 13 );
                C_ = rol( C_ + f1( D_, A_, B_ ) + K1_ +  X4,  7 );
                B_ = rol( B_ + f1( C_, D_, A_ ) + K1_ + X13,  5 );

                A_ = rol( A_ + f0( B_, C_, D_ ) +        X8, 15 );
                D_ = rol( D_ + f0( A_, B_, C_ ) +        X6,  5 );
                C_ = rol( C_ + f0( D_, A_, B_ ) +        X4,  8 );
                B_ = rol( B_ + f0( C_, D_, A_ ) +        X1, 11 );
                A_ = rol( A_ + f0( B_, C_, D_ ) +        X3, 14 );
                D_ = rol( D_ + f0( A_, B_, C_ ) +       X11, 14 );
                C_ = rol( C_ + f0( D_, A_, B_ ) +       X15,  6 );
                B_ = rol( B_ + f0( C_, D_, A_ ) +        X0, 14 );
                A_ = rol( A_ + f0( B_, C_, D_ ) +        X5,  6 );
                D_ = rol( D_ + f0( A_, B_, C_ ) +       X12,  9 );
                C_ = rol( C_ + f0( D_, A_, B_ ) +        X2, 12 );
                B_ = rol( B_ + f0( C_, D_, A_ ) +       X13,  9 );
                A_ = rol( A_ + f0( B_, C_, D_ ) +        X9, 12 );
                D_ = rol( D_ + f0( A_, B_, C_ ) +        X7,  5 );
                C_ = rol( C_ + f0( D_, A_, B_ ) +       X10, 15 );
                B_ = rol( B_ + f0( C_, D_, A_ ) +       X14,  8 );

                const tmp = ( H0 + B + C_ ) & 0xFFFF_FFFF;
                H0        = ( H1 + C + D_ ) & 0xFFFF_FFFF;
                H1        = ( H2 + D + A_ ) & 0xFFFF_FFFF;
                H2        = ( H3 + A + B_ ) & 0xFFFF_FFFF;
                H3        = tmp;
            }
        }
        else {
            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            className += "-mini";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3,
                    A_ = H0, B_ = H1, C_ = H2, D_ = H3;

                for( let i = 0; i < 64; i++ ) {
                    A = rol( A + FUNC[i >>> 4]( B, C, D ) + K[i >>> 4]
                        + X[R[i]], S[i] );
                    const tmp = A; A = D; D = C; C = B; B = tmp;

                    A_ = rol( A_ + FUNC[( 63 - i ) >>> 4]( B_, C_, D_ )
                        + K_[i >>> 4] + X[R_[i]], S_[i] );
                    const tmp_ = A_; A_ = D_; D_ = C_; C_ = B_; B_ = tmp_;
                }

                const tmp = ( H0 + B + C_ ) & 0xFFFF_FFFF;
                H0        = ( H1 + C + D_ ) & 0xFFFF_FFFF;
                H1        = ( H2 + D + A_ ) & 0xFFFF_FFFF;
                H2        = ( H3 + A + B_ ) & 0xFFFF_FFFF;
                H3        = tmp;
            }
       };

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, ripemd128ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class RIPEMD256
const RIPEMD256 = ( function() {

    const superClass = PADDING_LE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 32;

    const ripemd256ref = new Map( [
        // ""
        [ 0, "02ba4c4e5f8ecd1877fc52d64d30e37a2d9774fb1e5d026380ae0168e3c5522d" ],
        // "a"
        [ 1, "f9333e45d857f5d90a91bab70a1eba0cfb1be4b0783c9acfcd883a9134692925" ],
        // "abc"
        [ 2, "afbd6e228b9d8cbbcef5ca2d03e6dba10ac0bc7dcbe4680e1e42d2e975459b65" ],
        // "\x55".repeat( 56 )
        [ 3, "9d14194ddb800541fa88961e62e4fc3e3b2255c7489fc191a36a5d081cb60cc9" ],
        // "\xaa".repeat( 112 )
        [ 4, "81c0fc4ac1517889b44a10c6f862a23caeaf66a1de9bc560474886f8d39bc091" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "2844cbc894d391617e5701febac25014b64fc10e2b76ca89a3f167b884d59418" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "b2263435c3534c121978e4c1e506f469f88eb5b5d5f8713b7711cf6c60595835" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "25bd68e19399e6c1da75d455e73c73b86580706cb27dbad9ea5cf24d1956fe27" ]
    ] );

    const K1  = 0x5A82_7999, K2  = 0x6ED9_EBA1, K3  = 0x8F1B_BCDC,
          K1_ = 0x6D70_3EF3, K2_ = 0x5C4D_D124, K3_ = 0x50A2_8BE6;

    const K = [ 0x0000_0000, K1, K2, K3 ];

    const R = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2
    ];

    const S = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12
    ];

    const K_ = [ K3_, K2_, K1_, 0x0000_0000 ];

    const R_ = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14
    ];

    const S_ = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8
    ];

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    function f0( a, b, c ) {
        return a ^ b ^ c;
    }

    function f1( a, b, c ) {
//      return ( a & b ) | ( ( ~a ) & c );
        return ( c ^ ( a & ( b ^ c ) ) );
    }

    function f2( a, b, c ) {
        return ( a | ( ~b ) ) ^ c;
    }

    function f3( a, b, c ) {
//      return ( a & c ) | ( b & ( ~c ) );
        return ( b ^ ( c & ( a ^ b ) ) );
    }

    const FUNC = [ f0, f1, f2, f3 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_LE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let H0, H1, H2, H3, H4, H5, H6, H7;

        let className = "RIPEMD256";

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let A  = H0, B  = H1, C  = H2, D  = H3,
                    A_ = H4, B_ = H5, C_ = H6, D_ = H7;

                A  = rol( A  + f0( B , C , D  ) +        X0, 11 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X5,  8 );
                D  = rol( D  + f0( A , B , C  ) +        X1, 14 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ + X14 , 9 );
                C  = rol( C  + f0( D , A , B  ) +        X2, 15 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ +  X7,  9 );
                B  = rol( B  + f0( C , D , A  ) +        X3, 12 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X0, 11 );
                A  = rol( A  + f0( B , C , D  ) +        X4,  5 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X9, 13 );
                D  = rol( D  + f0( A , B , C  ) +        X5,  8 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ +  X2, 15 );
                C  = rol( C  + f0( D , A , B  ) +        X6,  7 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ + X11, 15 );
                B  = rol( B  + f0( C , D , A  ) +        X7,  9 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X4,  5 );
                A  = rol( A  + f0( B , C , D  ) +        X8, 11 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ + X13,  7 );
                D  = rol( D  + f0( A , B , C  ) +        X9, 13 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ +  X6,  7 );
                C  = rol( C  + f0( D , A , B  ) +       X10, 14 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ + X15,  8 );
                B  = rol( B  + f0( C , D , A  ) +       X11, 15 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ +  X8, 11 );
                A  = rol( A  + f0( B , C , D  ) +       X12,  6 );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X1, 14 );
                D  = rol( D  + f0( A , B , C  ) +       X13,  7 );
                D_ = rol( D_ + f3( A_, B_, C_ ) + K3_ + X10, 14 );
                C  = rol( C  + f0( D , A , B  ) +       X14,  9 );
                C_ = rol( C_ + f3( D_, A_, B_ ) + K3_ +  X3, 12 );
                B  = rol( B  + f0( C , D , A  ) +       X15,  8 );
                B_ = rol( B_ + f3( C_, D_, A_ ) + K3_ + X12,  6 );

                A_ = rol( A_ + f1( B , C , D  ) + K1  +  X7,  7 );
                A  = rol( A  + f2( B_, C_, D_ ) + K2_ +  X6,  9 );
                D  = rol( D  + f1( A_, B , C  ) + K1  +  X4,  6 );
                D_ = rol( D_ + f2( A , B_, C_ ) + K2_ + X11, 13 );
                C  = rol( C  + f1( D , A_, B  ) + K1  + X13,  8 );
                C_ = rol( C_ + f2( D_, A , B_ ) + K2_ +  X3, 15 );
                B  = rol( B  + f1( C , D , A_ ) + K1  +  X1, 13 );
                B_ = rol( B_ + f2( C_, D_, A  ) + K2_ +  X7,  7 );
                A_ = rol( A_ + f1( B , C , D  ) + K1  + X10, 11 );
                A  = rol( A  + f2( B_, C_, D_ ) + K2_ +  X0, 12 );
                D  = rol( D  + f1( A_, B , C  ) + K1  +  X6,  9 );
                D_ = rol( D_ + f2( A , B_, C_ ) + K2_ + X13,  8 );
                C  = rol( C  + f1( D , A_, B  ) + K1  + X15,  7 );
                C_ = rol( C_ + f2( D_, A , B_ ) + K2_ +  X5,  9 );
                B  = rol( B  + f1( C , D , A_ ) + K1  +  X3, 15 );
                B_ = rol( B_ + f2( C_, D_, A  ) + K2_ + X10, 11 );
                A_ = rol( A_ + f1( B , C , D  ) + K1  + X12,  7 );
                A  = rol( A  + f2( B_, C_, D_ ) + K2_ + X14,  7 );
                D  = rol( D  + f1( A_, B , C  ) + K1  +  X0, 12 );
                D_ = rol( D_ + f2( A , B_, C_ ) + K2_ + X15,  7 );
                C  = rol( C  + f1( D , A_, B  ) + K1  +  X9, 15 );
                C_ = rol( C_ + f2( D_, A , B_ ) + K2_ +  X8, 12 );
                B  = rol( B  + f1( C , D , A_ ) + K1  +  X5,  9 );
                B_ = rol( B_ + f2( C_, D_, A  ) + K2_ + X12,  7 );
                A_ = rol( A_ + f1( B , C , D  ) + K1  +  X2, 11 );
                A  = rol( A  + f2( B_, C_, D_ ) + K2_ +  X4,  6 );
                D  = rol( D  + f1( A_, B , C  ) + K1  + X14,  7 );
                D_ = rol( D_ + f2( A , B_, C_ ) + K2_ +  X9, 15 );
                C  = rol( C  + f1( D , A_, B  ) + K1  + X11, 13 );
                C_ = rol( C_ + f2( D_, A , B_ ) + K2_ +  X1, 13 );
                B  = rol( B  + f1( C , D , A_ ) + K1  +  X8, 12 );
                B_ = rol( B_ + f2( C_, D_, A  ) + K2_ +  X2, 11 );

                A_ = rol( A_ + f2( B_, C , D  ) + K2  +  X3, 11 );
                A  = rol( A  + f1( B , C_, D_ ) + K1_ + X15,  9 );
                D  = rol( D  + f2( A_, B_, C  ) + K2  + X10, 13 );
                D_ = rol( D_ + f1( A , B , C_ ) + K1_ +  X5,  7 );
                C  = rol( C  + f2( D , A_, B_ ) + K2  + X14,  6 );
                C_ = rol( C_ + f1( D_, A , B  ) + K1_ +  X1, 15 );
                B_ = rol( B_ + f2( C , D , A_ ) + K2  +  X4,  7 );
                B  = rol( B  + f1( C_, D_, A  ) + K1_ +  X3, 11 );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  +  X9, 14 );
                A  = rol( A  + f1( B , C_, D_ ) + K1_ +  X7,  8 );
                D  = rol( D  + f2( A_, B_, C  ) + K2  + X15,  9 );
                D_ = rol( D_ + f1( A , B , C_ ) + K1_ + X14,  6 );
                C  = rol( C  + f2( D , A_, B_ ) + K2  +  X8, 13 );
                C_ = rol( C_ + f1( D_, A , B  ) + K1_ +  X6,  6 );
                B_ = rol( B_ + f2( C , D , A_ ) + K2  +  X1, 15 );
                B  = rol( B  + f1( C_, D_, A  ) + K1_ +  X9, 14 );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  +  X2, 14 );
                A  = rol( A  + f1( B , C_, D_ ) + K1_ + X11, 12 );
                D  = rol( D  + f2( A_, B_, C  ) + K2  +  X7,  8 );
                D_ = rol( D_ + f1( A , B , C_ ) + K1_ +  X8, 13 );
                C  = rol( C  + f2( D , A_, B_ ) + K2  +  X0, 13 );
                C_ = rol( C_ + f1( D_, A , B  ) + K1_ + X12,  5 );
                B_ = rol( B_ + f2( C , D , A_ ) + K2  +  X6,  6 );
                B  = rol( B  + f1( C_, D_, A  ) + K1_ +  X2, 14 );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  + X13,  5 );
                A  = rol( A  + f1( B , C_, D_ ) + K1_ + X10, 13 );
                D  = rol( D  + f2( A_, B_, C  ) + K2  + X11, 12 );
                D_ = rol( D_ + f1( A , B , C_ ) + K1_ +  X0, 13 );
                C  = rol( C  + f2( D , A_, B_ ) + K2  +  X5,  7 );
                C_ = rol( C_ + f1( D_, A , B  ) + K1_ +  X4,  7 );
                B_ = rol( B_ + f2( C , D , A_ ) + K2  + X12,  5 );
                B  = rol( B  + f1( C_, D_, A  ) + K1_ + X13,  5 );

                A_ = rol( A_ + f3( B_, C_, D  ) + K3  +  X1, 11 );
                A  = rol( A  + f0( B , C , D_ ) +        X8, 15 );
                D  = rol( D  + f3( A_, B_, C_ ) + K3  +  X9, 12 );
                D_ = rol( D_ + f0( A , B , C  ) +        X6,  5 );
                C_ = rol( C_ + f3( D , A_, B_ ) + K3  + X11, 14 );
                C  = rol( C  + f0( D_, A , B  ) +        X4,  8 );
                B_ = rol( B_ + f3( C_, D , A_ ) + K3  + X10, 15 );
                B  = rol( B  + f0( C , D_, A  ) +        X1, 11 );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  +  X0, 14 );
                A  = rol( A  + f0( B , C , D_ ) +        X3, 14 );
                D  = rol( D  + f3( A_, B_, C_ ) + K3  +  X8, 15 );
                D_ = rol( D_ + f0( A , B , C  ) +       X11, 14 );
                C_ = rol( C_ + f3( D , A_, B_ ) + K3  + X12,  9 );
                C  = rol( C  + f0( D_, A , B  ) +       X15,  6 );
                B_ = rol( B_ + f3( C_, D , A_ ) + K3  +  X4,  8 );
                B  = rol( B  + f0( C , D_, A  ) +        X0, 14 );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  + X13,  9 );
                A  = rol( A  + f0( B , C , D_ )        + X5,  6 );
                D  = rol( D  + f3( A_, B_, C_ ) + K3  +  X3, 14 );
                D_ = rol( D_ + f0( A , B , C  ) +       X12,  9 );
                C_ = rol( C_ + f3( D , A_, B_ ) + K3  +  X7,  5 );
                C  = rol( C  + f0( D_, A , B  ) +        X2, 12 );
                B_ = rol( B_ + f3( C_, D , A_ ) + K3  + X15,  6 );
                B  = rol( B  + f0( C , D_, A  ) +       X13,  9 );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  + X14,  8 );
                A  = rol( A  + f0( B , C , D_ ) +        X9, 12 );
                D  = rol( D  + f3( A_, B_, C_ ) + K3  +  X5,  6 );
                D_ = rol( D_ + f0( A , B , C  ) +        X7,  5 );
                C_ = rol( C_ + f3( D , A_, B_ ) + K3  +  X6,  5 );
                C  = rol( C  + f0( D_, A , B  ) +       X10, 15 );
                B_ = rol( B_ + f3( C_, D , A_ ) + K3  +  X2, 12 );
                B  = rol( B  + f0( C , D_, A  ) +       X14,  8 );

                H0 = ( H0 + A_ ) & 0xFFFF_FFFF;
                H1 = ( H1 + B_ ) & 0xFFFF_FFFF;
                H2 = ( H2 + C_ ) & 0xFFFF_FFFF;
                H3 = ( H3 + D_ ) & 0xFFFF_FFFF;
                H4 = ( H4 + A  ) & 0xFFFF_FFFF;
                H5 = ( H5 + B  ) & 0xFFFF_FFFF;
                H6 = ( H6 + C  ) & 0xFFFF_FFFF;
                H7 = ( H7 + D  ) & 0xFFFF_FFFF;
            }
        }
        else {
            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            className += "-mini";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                let A  = H0, B  = H1, C  = H2, D  = H3,
                    A_ = H4, B_ = H5, C_ = H6, D_ = H7;

                const SWAP = [
                    () => { const tmp = A; A = A_; A_ = tmp; },
                    () => { const tmp = B; B = B_; B_ = tmp; },
                    () => { const tmp = C; C = C_; C_ = tmp; },
                    () => { const tmp = D; D = D_; D_ = tmp; }
                ];

                for( let i = 0; i < 64; i++ ) {
                    A = rol( A + FUNC[i >>> 4]( B, C, D ) + K[i >>> 4]
                        + X[R[i]], S[i] );
                    const tmp = A; A = D; D = C; C = B; B = tmp;

                    A_ = rol( A_ + FUNC[( 63 - i ) >>> 4]( B_, C_, D_ )
                        + K_[i >>> 4] + X[R_[i]], S_[i] );
                    const tmp_ = A_; A_ = D_; D_ = C_; C_ = B_; B_ = tmp_;

                    if( ( i & 15 ) == 15 )
                        SWAP[i >>> 4]();
                }

                H0 = ( H0 + A  ) & 0xFFFF_FFFF;
                H1 = ( H1 + B  ) & 0xFFFF_FFFF;
                H2 = ( H2 + C  ) & 0xFFFF_FFFF;
                H3 = ( H3 + D  ) & 0xFFFF_FFFF;
                H4 = ( H4 + A_ ) & 0xFFFF_FFFF;
                H5 = ( H5 + B_ ) & 0xFFFF_FFFF;
                H6 = ( H6 + C_ ) & 0xFFFF_FFFF;
                H7 = ( H7 + D_ ) & 0xFFFF_FFFF;
            }
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3, H4, H5, H6, H7 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
            H4 = 0x7654_3210;
            H5 = 0xFEDC_BA98;
            H6 = 0x89AB_CDEF;
            H7 = 0x0123_4567;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, ripemd256ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class RIPEM160
const RIPEMD160 = ( function() {

    const superClass = PADDING_LE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 20;

    const ripemd160ref = new Map( [
        // ""
        [ 0, "9c1185a5c5e9fc54612808977ee8f548b2258d31" ],
        // "a"
        [ 1, "0bdc9d2d256b3ee9daae347be6f4dc835a467ffe" ],
        // "abc"
        [ 2, "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc" ],
        // "\x55".repeat( 56 )
        [ 3, "22b34711ec14abe4ab8816c9ae5b9afe776979f3" ],
        // "\xaa".repeat( 112 )
        [ 4, "621be5b1dc2cb4a5fe9b155dd8676c329bb91a34" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "fa40330fc4b92bb3b8bb0a275195e9d496647bc6" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "5b8ea9b82c39b311b796284687e2fe0102c9821e" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "255cdee1641f893e3cc514c71b7ed4c6088c4bba" ]
    ] );

    const K1  = 0x5A82_7999, K2  = 0x6ED9_EBA1, K3  = 0x8F1B_BCDC,
          K4  = 0xA953_FD4E;
    const K1_ = 0x7A6D_76E9, K2_ = 0x6D70_3EF3, K3_ = 0x5C4D_D124,
          K4_ = 0x50A2_8BE6

    const K = [ 0x0000_0000, K1, K2, K3, K4 ];

    const R = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
        4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
    ];

    const S = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
        9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
    ];

    const K_ = [ K4_, K3_, K2_, K1_, 0x0000_0000 ];

    const R_ = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
        12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
    ];

    const S_ = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
        8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
    ];

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    function rol10( a ) {
        return ( a << 10 ) | ( a >>> -10 );
    }

    function f0( a, b, c ) {
        return a ^ b ^ c;
    }

    function f1( a, b, c ) {
//      return ( a & b ) | ( ( ~a ) & c );
        return ( c ^ ( a & ( b ^ c ) ) );
    }

    function f2( a, b, c ) {
        return ( a | ( ~b ) ) ^ c;
    }

    function f3( a, b, c ) {
//      return ( a & c ) | ( b & ( ~c ) );
        return ( b ^ ( c & ( a ^ b ) ) );
    }

    function f4( a, b, c ) {
        return a ^ ( b | ( ~c ) );
    }

    const FUNC = [ f0, f1, f2, f3, f4 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_LE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let H0, H1, H2, H3, H4;

        let className = "RIPEMD160";

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3, E = H4;

                A = rol( A + f0( B, C, D ) +       X0, 11 ) + E; C = rol10( C );
                E = rol( E + f0( A, B, C ) +       X1, 14 ) + D; B = rol10( B );
                D = rol( D + f0( E, A, B ) +       X2, 15 ) + C; A = rol10( A );
                C = rol( C + f0( D, E, A ) +       X3, 12 ) + B; E = rol10( E );
                B = rol( B + f0( C, D, E ) +       X4,  5 ) + A; D = rol10( D );
                A = rol( A + f0( B, C, D ) +       X5,  8 ) + E; C = rol10( C );
                E = rol( E + f0( A, B, C ) +       X6,  7 ) + D; B = rol10( B );
                D = rol( D + f0( E, A, B ) +       X7,  9 ) + C; A = rol10( A );
                C = rol( C + f0( D, E, A ) +       X8, 11 ) + B; E = rol10( E );
                B = rol( B + f0( C, D, E ) +       X9, 13 ) + A; D = rol10( D );
                A = rol( A + f0( B, C, D ) +      X10, 14 ) + E; C = rol10( C );
                E = rol( E + f0( A, B, C ) +      X11, 15 ) + D; B = rol10( B );
                D = rol( D + f0( E, A, B ) +      X12,  6 ) + C; A = rol10( A );
                C = rol( C + f0( D, E, A ) +      X13,  7 ) + B; E = rol10( E );
                B = rol( B + f0( C, D, E ) +      X14,  9 ) + A; D = rol10( D );
                A = rol( A + f0( B, C, D ) +      X15,  8 ) + E; C = rol10( C );

                E = rol( E + f1( A, B, C ) + K1 +  X7,  7 ) + D; B = rol10( B );
                D = rol( D + f1( E, A, B ) + K1 +  X4,  6 ) + C; A = rol10( A );
                C = rol( C + f1( D, E, A ) + K1 + X13,  8 ) + B; E = rol10( E );
                B = rol( B + f1( C, D, E ) + K1 +  X1, 13 ) + A; D = rol10( D );
                A = rol( A + f1( B, C, D ) + K1 + X10, 11 ) + E; C = rol10( C );
                E = rol( E + f1( A, B, C ) + K1 +  X6,  9 ) + D; B = rol10( B );
                D = rol( D + f1( E, A, B ) + K1 + X15,  7 ) + C; A = rol10( A );
                C = rol( C + f1( D, E, A ) + K1 +  X3, 15 ) + B; E = rol10( E );
                B = rol( B + f1( C, D, E ) + K1 + X12,  7 ) + A; D = rol10( D );
                A = rol( A + f1( B, C, D ) + K1 +  X0, 12 ) + E; C = rol10( C );
                E = rol( E + f1( A, B, C ) + K1 +  X9, 15 ) + D; B = rol10( B );
                D = rol( D + f1( E, A, B ) + K1 +  X5,  9 ) + C; A = rol10( A );
                C = rol( C + f1( D, E, A ) + K1 +  X2, 11 ) + B; E = rol10( E );
                B = rol( B + f1( C, D, E ) + K1 + X14,  7 ) + A; D = rol10( D );
                A = rol( A + f1( B, C, D ) + K1 + X11, 13 ) + E; C = rol10( C );
                E = rol( E + f1( A, B, C ) + K1 +  X8, 12 ) + D; B = rol10( B );

                D = rol( D + f2( E, A, B ) + K2 +  X3, 11 ) + C; A = rol10( A );
                C = rol( C + f2( D, E, A ) + K2 + X10, 13 ) + B; E = rol10( E );
                B = rol( B + f2( C, D, E ) + K2 + X14,  6 ) + A; D = rol10( D );
                A = rol( A + f2( B, C, D ) + K2 +  X4,  7 ) + E; C = rol10( C );
                E = rol( E + f2( A, B, C ) + K2 +  X9, 14 ) + D; B = rol10( B );
                D = rol( D + f2( E, A, B ) + K2 + X15,  9 ) + C; A = rol10( A );
                C = rol( C + f2( D, E, A ) + K2 +  X8, 13 ) + B; E = rol10( E );
                B = rol( B + f2( C, D, E ) + K2 +  X1, 15 ) + A; D = rol10( D );
                A = rol( A + f2( B, C, D ) + K2 +  X2, 14 ) + E; C = rol10( C );
                E = rol( E + f2( A, B, C ) + K2 +  X7,  8 ) + D; B = rol10( B );
                D = rol( D + f2( E, A, B ) + K2 +  X0, 13 ) + C; A = rol10( A );
                C = rol( C + f2( D, E, A ) + K2 +  X6,  6 ) + B; E = rol10( E );
                B = rol( B + f2( C, D, E ) + K2 + X13,  5 ) + A; D = rol10( D );
                A = rol( A + f2( B, C, D ) + K2 + X11, 12 ) + E; C = rol10( C );
                E = rol( E + f2( A, B, C ) + K2 +  X5,  7 ) + D; B = rol10( B );
                D = rol( D + f2( E, A, B ) + K2 + X12,  5 ) + C; A = rol10( A );

                C = rol( C + f3( D, E, A ) + K3 +  X1, 11 ) + B; E = rol10( E );
                B = rol( B + f3( C, D, E ) + K3 +  X9, 12 ) + A; D = rol10( D );
                A = rol( A + f3( B, C, D ) + K3 + X11, 14 ) + E; C = rol10( C );
                E = rol( E + f3( A, B, C ) + K3 + X10, 15 ) + D; B = rol10( B );
                D = rol( D + f3( E, A, B ) + K3 +  X0, 14 ) + C; A = rol10( A );
                C = rol( C + f3( D, E, A ) + K3 +  X8, 15 ) + B; E = rol10( E );
                B = rol( B + f3( C, D, E ) + K3 + X12,  9 ) + A; D = rol10( D );
                A = rol( A + f3( B, C, D ) + K3 +  X4,  8 ) + E; C = rol10( C );
                E = rol( E + f3( A, B, C ) + K3 + X13,  9 ) + D; B = rol10( B );
                D = rol( D + f3( E, A, B ) + K3 +  X3, 14 ) + C; A = rol10( A );
                C = rol( C + f3( D, E, A ) + K3 +  X7,  5 ) + B; E = rol10( E );
                B = rol( B + f3( C, D, E ) + K3 + X15,  6 ) + A; D = rol10( D );
                A = rol( A + f3( B, C, D ) + K3 + X14,  8 ) + E; C = rol10( C );
                E = rol( E + f3( A, B, C ) + K3 +  X5,  6 ) + D; B = rol10( B );
                D = rol( D + f3( E, A, B ) + K3 +  X6,  5 ) + C; A = rol10( A );
                C = rol( C + f3( D, E, A ) + K3 +  X2, 12 ) + B; E = rol10( E );

                B = rol( B + f4( C, D, E ) + K4 +  X4,  9 ) + A; D = rol10( D );
                A = rol( A + f4( B, C, D ) + K4 +  X0, 15 ) + E; C = rol10( C );
                E = rol( E + f4( A, B, C ) + K4 +  X5,  5 ) + D; B = rol10( B );
                D = rol( D + f4( E, A, B ) + K4 +  X9, 11 ) + C; A = rol10( A );
                C = rol( C + f4( D, E, A ) + K4 +  X7,  6 ) + B; E = rol10( E );
                B = rol( B + f4( C, D, E ) + K4 + X12,  8 ) + A; D = rol10( D );
                A = rol( A + f4( B, C, D ) + K4 +  X2, 13 ) + E; C = rol10( C );
                E = rol( E + f4( A, B, C ) + K4 + X10, 12 ) + D; B = rol10( B );
                D = rol( D + f4( E, A, B ) + K4 + X14,  5 ) + C; A = rol10( A );
                C = rol( C + f4( D, E, A ) + K4 +  X1, 12 ) + B; E = rol10( E );
                B = rol( B + f4( C, D, E ) + K4 +  X3, 13 ) + A; D = rol10( D );
                A = rol( A + f4( B, C, D ) + K4 +  X8, 14 ) + E; C = rol10( C );
                E = rol( E + f4( A, B, C ) + K4 + X11, 11 ) + D; B = rol10( B );
                D = rol( D + f4( E, A, B ) + K4 +  X6,  8 ) + C; A = rol10( A );
                C = rol( C + f4( D, E, A ) + K4 + X15,  5 ) + B; E = rol10( E );
                B = rol( B + f4( C, D, E ) + K4 + X13,  6 ) + A; D = rol10( D );

                let A_ = H0, B_ = H1, C_ = H2, D_ = H3, E_ = H4;

                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ +  X5,  8 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ + X14,  9 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X7,  9 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ +  X0, 11 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X9, 13 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ +  X2, 15 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ + X11, 15 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X4,  5 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ + X13,  7 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X6,  7 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ + X15,  8 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ +  X8, 11 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X1, 14 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ + X10, 14 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X3, 12 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ + X12,  6 ) + E_; C_ = rol10( C_ );

                E_ = rol( E_ + f3( A_, B_, C_ ) + K3_ +  X6,  9 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f3( E_, A_, B_ ) + K3_ + X11, 13 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f3( D_, E_, A_ ) + K3_ +  X3, 15 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ +  X7,  7 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X0, 12 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f3( A_, B_, C_ ) + K3_ + X13,  8 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f3( E_, A_, B_ ) + K3_ +  X5,  9 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f3( D_, E_, A_ ) + K3_ + X10, 11 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ + X14,  7 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ + X15,  7 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f3( A_, B_, C_ ) + K3_ +  X8, 12 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f3( E_, A_, B_ ) + K3_ + X12,  7 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f3( D_, E_, A_ ) + K3_ +  X4,  6 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ +  X9, 15 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D_ ) + K3_ +  X1, 13 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f3( A_, B_, C_ ) + K3_ +  X2, 11 ) + D_; B_ = rol10( B_ );

                D_ = rol( D_ + f2( E_, A_, B_ ) + K2_ + X15,  9 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f2( D_, E_, A_ ) + K2_ +  X5,  7 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C_, D_, E_ ) + K2_ +  X1, 15 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ +  X3, 11 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f2( A_, B_, C_ ) + K2_ +  X7,  8 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f2( E_, A_, B_ ) + K2_ + X14,  6 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f2( D_, E_, A_ ) + K2_ +  X6,  6 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C_, D_, E_ ) + K2_ +  X9, 14 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ + X11, 12 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f2( A_, B_, C_ ) + K2_ +  X8, 13 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f2( E_, A_, B_ ) + K2_ + X12,  5 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f2( D_, E_, A_ ) + K2_ +  X2, 14 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C_, D_, E_ ) + K2_ + X10, 13 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C_, D_ ) + K2_ +  X0, 13 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f2( A_, B_, C_ ) + K2_ +  X4,  7 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f2( E_, A_, B_ ) + K2_ + X13,  5 ) + C_; A_ = rol10( A_ );

                C_ = rol( C_ + f1( D_, E_, A_ ) + K1_ +  X8, 15 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f1( C_, D_, E_ ) + K1_ +  X6,  5 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ +  X4,  8 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f1( A_, B_, C_ ) + K1_ +  X1, 11 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f1( E_, A_, B_ ) + K1_ +  X3, 14 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f1( D_, E_, A_ ) + K1_ + X11, 14 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f1( C_, D_, E_ ) + K1_ + X15,  6 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ +  X0, 14 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f1( A_, B_, C_ ) + K1_ +  X5,  6 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f1( E_, A_, B_ ) + K1_ + X12,  9 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f1( D_, E_, A_ ) + K1_ +  X2, 12 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f1( C_, D_, E_ ) + K1_ + X13,  9 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B_, C_, D_ ) + K1_ +  X9, 12 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f1( A_, B_, C_ ) + K1_ +  X7,  5 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f1( E_, A_, B_ ) + K1_ + X10, 15 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f1( D_, E_, A_ ) + K1_ + X14,  8 ) + B_; E_ = rol10( E_ );

                B_ = rol( B_ + f0( C_, D_, E_ ) +       X12,  8 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f0( B_, C_, D_ ) +       X15,  5 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f0( A_, B_, C_ ) +       X10, 12 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f0( E_, A_, B_ ) +        X4,  9 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f0( D_, E_, A_ ) +        X1, 12 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f0( C_, D_, E_ ) +        X5,  5 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f0( B_, C_, D_ ) +        X8, 14 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f0( A_, B_, C_ ) +        X7,  6 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f0( E_, A_, B_ ) +        X6,  8 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f0( D_, E_, A_ ) +        X2, 13 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f0( C_, D_, E_ ) +       X13,  6 ) + A_; D_ = rol10( D_ );
                A_ = rol( A_ + f0( B_, C_, D_ ) +       X14,  5 ) + E_; C_ = rol10( C_ );
                E_ = rol( E_ + f0( A_, B_, C_ ) +        X0, 15 ) + D_; B_ = rol10( B_ );
                D_ = rol( D_ + f0( E_, A_, B_ ) +        X3, 13 ) + C_; A_ = rol10( A_ );
                C_ = rol( C_ + f0( D_, E_, A_ ) +        X9, 11 ) + B_; E_ = rol10( E_ );
                B_ = rol( B_ + f0( C_, D_, E_ ) +       X11, 11 ) + A_; D_ = rol10( D_ );

                const tmp = ( H0 + B + C_ ) & 0xFFFF_FFFF;
                H0        = ( H1 + C + D_ ) & 0xFFFF_FFFF;
                H1        = ( H2 + D + E_ ) & 0xFFFF_FFFF;
                H2        = ( H3 + E + A_ ) & 0xFFFF_FFFF;
                H3        = ( H4 + A + B_ ) & 0xFFFF_FFFF;
                H4        = tmp;
            }
        }
        else {
            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            className += "-mini";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                let A  = H0, B  = H1, C  = H2, D  = H3, E  = H4,
                    A_ = H0, B_ = H1, C_ = H2, D_ = H3, E_ = H4;

                for( let i = 0; i < 80; i++ ) {

                    A = rol( A + FUNC[i >>> 4]( B, C, D ) + K[i >>> 4]
                        + X[R[i]], S[i] ) + E;
                    C = rol( C, 10 );
                    const tmp = A; A = E; E = D; D = C; C = B; B = tmp;

                    A_ = rol( A_ + FUNC[( 79 - i ) >>> 4]( B_, C_, D_ )
                        + K_[i >>> 4] + X[R_[i]], S_[i] ) + E_;
                    C_ = rol( C_, 10 );
                    const tmp_ = A_; A_ = E_; E_ = D_;  D_ = C_; C_ = B_; B_ = tmp_;
                }

                const tmp = ( H0 + B + C_ ) & 0xFFFF_FFFF;
                H0        = ( H1 + C + D_ ) & 0xFFFF_FFFF;
                H1        = ( H2 + D + E_ ) & 0xFFFF_FFFF;
                H2        = ( H3 + E + A_ ) & 0xFFFF_FFFF;
                H3        = ( H4 + A + B_ ) & 0xFFFF_FFFF;
                H4        = tmp;
            }
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3, H4 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
            H4 = 0xC3D2_E1F0;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, ripemd160ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class RIPEM320
const RIPEMD320 = ( function() {

    const superClass = PADDING_LE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 40;

    const ripemd320ref = new Map( [
        // ""
        [ 0, "22d65d5661536cdc75c1fdf5c6de7b41b9f27325ebc61e8557177d705a0ec880151c3a32a00899b8" ],
        // "a"
        [ 1, "ce78850638f92658a5a585097579926dda667a5716562cfcf6fbe77f63542f99b04705d6970dff5d" ],
        // "abc"
        [ 2, "de4c01b3054f8930a79d09ae738e92301e5a17085beffdc1b8d116713e74f82fa942d64cdbc4682d" ],
        // "\x55".repeat( 56 )
        [ 3, "73bda2c6983146cbc2bab9034f890e6b12ebb26b9380fe805f26303be363fec96a87fea3aa7aa9e0" ],
        // "\xaa".repeat( 112 )
        [ 4, "92023577df96ed08295371ba0f7d31a0e06d5e9ce7926a6a9065fb91658ea934f36a635142f1533c" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "9b702192e1e5db9d587c0f30987591d4f8489aaf24f0459c0eb7231c9f754f52d70063c41885fbe0" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "04731d000f43b0302971e7f1a950443bf676b0d434ec44d2636d630525cb9811d0442140011e1814" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "9b18a32e5380d112f1cb26c639511d21453e4d9eaf5401a08d675c73470702d3921d4c19c4232979" ]
    ] );

    const K1  = 0x5A82_7999, K2  = 0x6ED9_EBA1, K3  = 0x8F1B_BCDC,
          K4  = 0xA953_FD4E;
    const K1_ = 0x7A6D_76E9, K2_ = 0x6D70_3EF3, K3_ = 0x5C4D_D124,
          K4_ = 0x50A2_8BE6

    const K = [ 0x0000_0000, K1, K2, K3, K4 ];

    const R = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
        4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
    ];

    const S = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
        9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
    ];

    const K_ = [ K4_, K3_, K2_, K1_, 0x0000_0000 ];

    const R_ = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
        12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
    ];

    const S_ = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
        8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
    ];

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    function rol10( a ) {
        return ( a << 10 ) | ( a >>> -10 );
    }

    function f0( a, b, c ) {
        return a ^ b ^ c;
    }

    function f1( a, b, c ) {
//      return ( a & b ) | ( ( ~a ) & c );
        return ( c ^ ( a & ( b ^ c ) ) );
    }

    function f2( a, b, c ) {
        return ( a | ( ~b ) ) ^ c;
    }

    function f3( a, b, c ) {
//      return ( a & c ) | ( b & ( ~c ) );
        return ( b ^ ( c & ( a ^ b ) ) );
    }

    function f4( a, b, c ) {
        return a ^ ( b | ( ~c ) );
    }

    const FUNC = [ f0, f1, f2, f3, f4 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_LE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let H0, H1, H2, H3, H4, H5, H6, H7, H8, H9;

        let className = "RIPEMD320";

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let A  = H0, B  = H1, C  = H2, D  = H3, E  = H4,
                    A_ = H5, B_ = H6, C_ = H7, D_ = H8, E_ = H9;

                A  = rol( A  + f0( B , C , D  ) +        X0, 11 ) + E ; C  = rol10( C  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ +  X5,  8 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f0( A , B , C  ) +        X1, 14 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ + X14,  9 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f0( E , A , B  ) +        X2, 15 ) + C ; A  = rol10( A  );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X7,  9 ) + C_; A_ = rol10( A_ );
                C  = rol( C  + f0( D , E , A  ) +        X3, 12 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ +  X0, 11 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f0( C , D , E  ) +        X4,  5 ) + A ; D  = rol10( D  );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X9, 13 ) + A_; D_ = rol10( D_ );
                A  = rol( A  + f0( B , C , D  ) +        X5,  8 ) + E ; C  = rol10( C  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ +  X2, 15 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f0( A , B , C  ) +        X6,  7 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ + X11, 15 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f0( E , A , B  ) +        X7,  9 ) + C ; A  = rol10( A  );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X4,  5 ) + C_; A_ = rol10( A_ );
                C  = rol( C  + f0( D , E , A  ) +        X8, 11 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ + X13,  7 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f0( C , D , E  ) +        X9, 13 ) + A ; D  = rol10( D  );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X6,  7 ) + A_; D_ = rol10( D_ );
                A  = rol( A  + f0( B , C , D  ) +       X10, 14 ) + E ; C  = rol10( C  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ + X15,  8 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f0( A , B , C  ) +       X11, 15 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f4( A_, B_, C_ ) + K4_ +  X8, 11 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f0( E , A , B  ) +       X12,  6 ) + C ; A  = rol10( A  );
                D_ = rol( D_ + f4( E_, A_, B_ ) + K4_ +  X1, 14 ) + C_; A_ = rol10( A_ );
                C  = rol( C  + f0( D , E , A  ) +       X13,  7 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f4( D_, E_, A_ ) + K4_ + X10, 14 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f0( C , D , E  ) +       X14,  9 ) + A ; D  = rol10( D  );
                B_ = rol( B_ + f4( C_, D_, E_ ) + K4_ +  X3, 12 ) + A_; D_ = rol10( D_ );
                A  = rol( A  + f0( B , C , D  ) +       X15,  8 ) + E ; C  = rol10( C  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4_ + X12,  6 ) + E_; C_ = rol10( C_ );

                E  = rol( E  + f1( A_, B , C  ) + K1  +  X7,  7 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f3( A , B_, C_ ) + K3_ +  X6,  9 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f1( E , A_, B  ) + K1  +  X4,  6 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f3( E_, A , B_ ) + K3_ + X11, 13 ) + C_; A  = rol10( A  );
                C  = rol( C  + f1( D , E , A_ ) + K1  + X13,  8 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f3( D_, E_, A  ) + K3_ +  X3, 15 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f1( C , D , E  ) + K1  +  X1, 13 ) + A_; D  = rol10( D  );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ +  X7,  7 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B , C , D  ) + K1  + X10, 11 ) + E ; C  = rol10( C  );
                A  = rol( A  + f3( B_, C_, D_ ) + K3_ +  X0, 12 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f1( A_, B , C  ) + K1  +  X6,  9 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f3( A , B_, C_ ) + K3_ + X13,  8 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f1( E , A_, B  ) + K1  + X15,  7 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f3( E_, A , B_ ) + K3_ +  X5,  9 ) + C_; A  = rol10( A  );
                C  = rol( C  + f1( D , E , A_ ) + K1  +  X3, 15 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f3( D_, E_, A  ) + K3_ + X10, 11 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f1( C , D , E  ) + K1  + X12,  7 ) + A_; D  = rol10( D  );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ + X14,  7 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B , C , D  ) + K1  +  X0, 12 ) + E ; C  = rol10( C  );
                A  = rol( A  + f3( B_, C_, D_ ) + K3_ + X15,  7 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f1( A_, B , C  ) + K1  +  X9, 15 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f3( A , B_, C_ ) + K3_ +  X8, 12 ) + D_; B_ = rol10( B_ );
                D  = rol( D  + f1( E , A_, B  ) + K1  +  X5,  9 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f3( E_, A , B_ ) + K3_ + X12,  7 ) + C_; A  = rol10( A  );
                C  = rol( C  + f1( D , E , A_ ) + K1  +  X2, 11 ) + B ; E  = rol10( E  );
                C_ = rol( C_ + f3( D_, E_, A  ) + K3_ +  X4,  6 ) + B_; E_ = rol10( E_ );
                B  = rol( B  + f1( C , D , E  ) + K1  + X14,  7 ) + A_; D  = rol10( D  );
                B_ = rol( B_ + f3( C_, D_, E_ ) + K3_ +  X9, 15 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f1( B , C , D  ) + K1  + X11, 13 ) + E ; C  = rol10( C  );
                A  = rol( A  + f3( B_, C_, D_ ) + K3_ +  X1, 13 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f1( A_, B , C  ) + K1  +  X8, 12 ) + D ; B  = rol10( B  );
                E_ = rol( E_ + f3( A , B_, C_ ) + K3_ +  X2, 11 ) + D_; B_ = rol10( B_ );

                D  = rol( D  + f2( E , A_, B_ ) + K2  +  X3, 11 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f2( E_, A , B  ) + K2_ + X15,  9 ) + C_; A  = rol10( A  );
                C  = rol( C  + f2( D , E , A_ ) + K2  + X10, 13 ) + B_; E  = rol10( E  );
                C_ = rol( C_ + f2( D_, E_, A  ) + K2_ +  X5,  7 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C , D , E  ) + K2  + X14,  6 ) + A_; D  = rol10( D  );
                B  = rol( B  + f2( C_, D_, E_ ) + K2_ +  X1, 15 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  +  X4,  7 ) + E ; C  = rol10( C  );
                A  = rol( A  + f2( B , C_, D_ ) + K2_ +  X3, 11 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f2( A_, B_, C  ) + K2  +  X9, 14 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f2( A , B , C_ ) + K2_ +  X7,  8 ) + D_; B  = rol10( B  );
                D  = rol( D  + f2( E , A_, B_ ) + K2  + X15,  9 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f2( E_, A , B  ) + K2_ + X14,  6 ) + C_; A  = rol10( A  );
                C  = rol( C  + f2( D , E , A_ ) + K2  +  X8, 13 ) + B_; E  = rol10( E  );
                C_ = rol( C_ + f2( D_, E_, A  ) + K2_ +  X6,  6 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C , D , E  ) + K2  +  X1, 15 ) + A_; D  = rol10( D  );
                B  = rol( B  + f2( C_, D_, E_ ) + K2_ +  X9, 14 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  +  X2, 14 ) + E ; C  = rol10( C  );
                A  = rol( A  + f2( B , C_, D_ ) + K2_ + X11, 12 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f2( A_, B_, C  ) + K2  +  X7,  8 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f2( A , B , C_ ) + K2_ +  X8, 13 ) + D_; B  = rol10( B  );
                D  = rol( D  + f2( E , A_, B_ ) + K2  +  X0, 13 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f2( E_, A , B  ) + K2_ + X12,  5 ) + C_; A  = rol10( A  );
                C  = rol( C  + f2( D , E , A_ ) + K2  +  X6,  6 ) + B_; E  = rol10( E  );
                C_ = rol( C_ + f2( D_, E_, A  ) + K2_ +  X2, 14 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f2( C , D , E  ) + K2  + X13,  5 ) + A_; D  = rol10( D  );
                B  = rol( B  + f2( C_, D_, E_ ) + K2_ + X10, 13 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f2( B_, C , D  ) + K2  + X11, 12 ) + E ; C  = rol10( C  );
                A  = rol( A  + f2( B , C_, D_ ) + K2_ +  X0, 13 ) + E_; C_ = rol10( C_ );
                E  = rol( E  + f2( A_, B_, C  ) + K2  +  X5,  7 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f2( A , B , C_ ) + K2_ +  X4,  7 ) + D_; B  = rol10( B  );
                D  = rol( D  + f2( E , A_, B_ ) + K2  + X12,  5 ) + C ; A_ = rol10( A_ );
                D_ = rol( D_ + f2( E_, A , B  ) + K2_ + X13,  5 ) + C_; A  = rol10( A  );

                C_ = rol( C_ + f3( D , E , A_ ) + K3  +  X1, 11 ) + B_; E  = rol10( E  );
                C  = rol( C  + f1( D_, E_, A  ) + K1_ +  X8, 15 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D , E  ) + K3  +  X9, 12 ) + A_; D  = rol10( D  );
                B  = rol( B  + f1( C , D_, E_ ) + K1_ +  X6,  5 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  + X11, 14 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f1( B , C , D_ ) + K1_ +  X4,  8 ) + E_; C  = rol10( C  );
                E  = rol( E  + f3( A_, B_, C_ ) + K3  + X10, 15 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f1( A , B , C  ) + K1_ +  X1, 11 ) + D_; B  = rol10( B  );
                D  = rol( D  + f3( E , A_, B_ ) + K3  +  X0, 14 ) + C_; A_ = rol10( A_ );
                D_ = rol( D_ + f1( E_, A , B  ) + K1_ +  X3, 14 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f3( D , E , A_ ) + K3  +  X8, 15 ) + B_; E  = rol10( E  );
                C  = rol( C  + f1( D_, E_, A  ) + K1_ + X11, 14 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D , E  ) + K3  + X12,  9 ) + A_; D  = rol10( D  );
                B  = rol( B  + f1( C , D_, E_ ) + K1_ + X15,  6 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  +  X4,  8 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f1( B , C , D_ ) + K1_ +  X0, 14 ) + E_; C  = rol10( C  );
                E  = rol( E  + f3( A_, B_, C_ ) + K3  + X13,  9 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f1( A , B , C  ) + K1_ +  X5,  6 ) + D_; B  = rol10( B  );
                D  = rol( D  + f3( E , A_, B_ ) + K3  +  X3, 14 ) + C_; A_ = rol10( A_ );
                D_ = rol( D_ + f1( E_, A , B  ) + K1_ + X12,  9 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f3( D , E , A_ ) + K3  +  X7,  5 ) + B_; E  = rol10( E  );
                C  = rol( C  + f1( D_, E_, A  ) + K1_ +  X2, 12 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f3( C_, D , E  ) + K3  + X15,  6 ) + A_; D  = rol10( D  );
                B  = rol( B  + f1( C , D_, E_ ) + K1_ + X13,  9 ) + A ; D_ = rol10( D_ );
                A_ = rol( A_ + f3( B_, C_, D  ) + K3  + X14,  8 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f1( B , C , D_ ) + K1_ +  X9, 12 ) + E_; C  = rol10( C  );
                E  = rol( E  + f3( A_, B_, C_ ) + K3  +  X5,  6 ) + D ; B_ = rol10( B_ );
                E_ = rol( E_ + f1( A , B , C  ) + K1_ +  X7,  5 ) + D_; B  = rol10( B  );
                D  = rol( D  + f3( E , A_, B_ ) + K3  +  X6,  5 ) + C_; A_ = rol10( A_ );
                D_ = rol( D_ + f1( E_, A , B  ) + K1_ + X10, 15 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f3( D , E , A_ ) + K3  +  X2, 12 ) + B_; E  = rol10( E  );
                C  = rol( C  + f1( D_, E_, A  ) + K1_ + X14,  8 ) + B ; E_ = rol10( E_ );

                B_ = rol( B_ + f4( C_, D_, E  ) + K4  +  X4,  9 ) + A_; D_ = rol10( D_ );
                B  = rol( B  + f0( C , D , E_ ) +       X12,  8 ) + A ; D  = rol10( D  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4  +  X0, 15 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f0( B , C , D  ) +       X15,  5 ) + E_; C  = rol10( C  );
                E  = rol( E  + f4( A_, B_, C_ ) + K4  +  X5,  5 ) + D_; B_ = rol10( B_ );
                E_ = rol( E_ + f0( A , B , C  ) +       X10, 12 ) + D ; B  = rol10( B  );
                D_ = rol( D_ + f4( E , A_, B_ ) + K4  +  X9, 11 ) + C_; A_ = rol10( A_ );
                D  = rol( D  + f0( E_, A , B  ) +        X4,  9 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f4( D_, E , A_ ) + K4  +  X7,  6 ) + B_; E  = rol10( E  );
                C  = rol( C  + f0( D , E_, A  ) +        X1, 12 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E  ) + K4  + X12,  8 ) + A_; D_ = rol10( D_ );
                B  = rol( B  + f0( C , D , E_ ) +        X5,  5 ) + A ; D  = rol10( D  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4  +  X2, 13 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f0( B , C , D  ) +        X8, 14 ) + E_; C  = rol10( C  );
                E  = rol( E  + f4( A_, B_, C_ ) + K4  + X10, 12 ) + D_; B_ = rol10( B_ );
                E_ = rol( E_ + f0( A , B , C  ) +        X7,  6 ) + D ; B  = rol10( B  );
                D_ = rol( D_ + f4( E , A_, B_ ) + K4  + X14,  5 ) + C_; A_ = rol10( A_ );
                D  = rol( D  + f0( E_, A , B  ) +        X6,  8 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f4( D_, E , A_ ) + K4  +  X1, 12 ) + B_; E  = rol10( E  );
                C  = rol( C  + f0( D , E_, A  ) +        X2, 13 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E  ) + K4  +  X3, 13 ) + A_; D_ = rol10( D_ );
                B  = rol( B  + f0( C , D , E_ ) +       X13,  6 ) + A ; D  = rol10( D  );
                A_ = rol( A_ + f4( B_, C_, D_ ) + K4  +  X8, 14 ) + E ; C_ = rol10( C_ );
                A  = rol( A  + f0( B , C , D  ) +       X14,  5 ) + E_; C  = rol10( C  );
                E  = rol( E  + f4( A_, B_, C_ ) + K4  + X11, 11 ) + D_; B_ = rol10( B_ );
                E_ = rol( E_ + f0( A , B , C  ) +        X0, 15 ) + D ; B  = rol10( B  );
                D_ = rol( D_ + f4( E , A_, B_ ) + K4  +  X6,  8 ) + C_; A_ = rol10( A_ );
                D  = rol( D  + f0( E_, A , B  ) +        X3, 13 ) + C ; A  = rol10( A  );
                C_ = rol( C_ + f4( D_, E , A_ ) + K4  + X15,  5 ) + B_; E  = rol10( E  );
                C  = rol( C  + f0( D , E_, A  ) +        X9, 11 ) + B ; E_ = rol10( E_ );
                B_ = rol( B_ + f4( C_, D_, E  ) + K4  + X13,  6 ) + A_; D_ = rol10( D_ );
                B  = rol( B  + f0( C , D , E_ ) +       X11, 11 ) + A ; D  = rol10( D  );

                H0 = ( H0 + A_ ) & 0xFFFF_FFFF;
                H1 = ( H1 + B_ ) & 0xFFFF_FFFF;
                H2 = ( H2 + C_ ) & 0xFFFF_FFFF;
                H3 = ( H3 + D_ ) & 0xFFFF_FFFF;
                H4 = ( H4 + E_ ) & 0xFFFF_FFFF;
                H5 = ( H5 + A  ) & 0xFFFF_FFFF;
                H6 = ( H6 + B  ) & 0xFFFF_FFFF;
                H7 = ( H7 + C  ) & 0xFFFF_FFFF;
                H8 = ( H8 + D  ) & 0xFFFF_FFFF;
                H9 = ( H9 + E  ) & 0xFFFF_FFFF;
            }
        }
        else {
            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            className += "-mini";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                let A  = H0, B  = H1, C  = H2, D  = H3, E  = H4,
                    A_ = H5, B_ = H6, C_ = H7, D_ = H8, E_ = H9;

                const SWAP = [
                    () => { const tmp = B; B = B_; B_ = tmp; },
                    () => { const tmp = D; D = D_; D_ = tmp; },
                    () => { const tmp = A; A = A_; A_ = tmp; },
                    () => { const tmp = C; C = C_; C_ = tmp; },
                    () => { const tmp = E; E = E_; E_ = tmp; }
                ];

                for( let i = 0; i < 80; i++ ) {
                    A = rol( A + FUNC[i >>> 4]( B, C, D ) + K[i >>> 4]
                        + X[R[i]], S[i] ) + E;
                    C = rol( C, 10 );
                    const tmp = A; A = E; E = D; D = C; C = B; B = tmp;

                    A_ = rol( A_ + FUNC[( 79 - i ) >>> 4]( B_, C_, D_ )
                        + K_[i >>> 4] + X[R_[i]], S_[i] ) + E_;
                    C_ = rol( C_, 10 );
                    const tmp_ = A_; A_ = E_; E_ = D_; D_ = C_; C_ = B_; B_ = tmp_;

                    if( ( i & 15 ) == 15 )
                        SWAP[i >>> 4]();

                }

                H0 = ( H0 + A  ) & 0xFFFF_FFFF;
                H1 = ( H1 + B  ) & 0xFFFF_FFFF;
                H2 = ( H2 + C  ) & 0xFFFF_FFFF;
                H3 = ( H3 + D  ) & 0xFFFF_FFFF;
                H4 = ( H4 + E  ) & 0xFFFF_FFFF;
                H5 = ( H5 + A_ ) & 0xFFFF_FFFF;
                H6 = ( H6 + B_ ) & 0xFFFF_FFFF;
                H7 = ( H7 + C_ ) & 0xFFFF_FFFF;
                H8 = ( H8 + D_ ) & 0xFFFF_FFFF;
                H9 = ( H9 + E_ ) & 0xFFFF_FFFF;
            }
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3, H4, H5, H6, H7, H8, H9 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
            H4 = 0xC3D2_E1F0;
            H5 = 0x7654_3210;
            H6 = 0xFEDC_BA98;
            H7 = 0x89AB_CDEF;
            H8 = 0x0123_4567;
            H9 = 0x3C2D_1E0F;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, ripemd320ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA1
// CRYPTOGRAPHICALLY OBSOLETE
const SHA1 = ( function() {

    const superClass = PADDING_BE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE = 20;

    const sha1ref = new Map( [
        // ""
        [ 0, "da39a3ee5e6b4b0d3255bfef95601890afd80709" ],
        // "a"
        [ 1, "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8" ],
        // "abc"
        [ 2, "a9993e364706816aba3e25717850c26c9cd0d89d" ],
        // "\x55".repeat( 56 )
        [ 3, "e6e040b9cc3ecfb5df99c2799e8bbac1c2aa0948" ],
        // "\xaa".repeat( 112 )
        [ 4, "9aef3a7daa1bcd878197c0d3e14742089566f422" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "c0b75e3e4fcb5cb2bcaa4770d45de4fb8327d71a" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "e68774d34bbdfbb5302c6470b68e7f09c5fc74f0" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "5fde1cce603e6566d20da811c9c8bcccb044d4ae" ]
    ] );

    function rol( a, b ) {
        return ( a << b ) | ( a >>> -b );
    }

    function rol1( a ) {
        return ( a << 1 ) | ( a >>> -1 );
    }

    function rol5( a ) {
        return ( a << 5 ) | ( a >>> -5 );
    }

    function rol30( a ) {
        return ( a << 30 ) | ( a >>> -30 );
    }

    function f0( a, b, c ) {
//      return ( ( a & b ) | ( ( ~a ) & c ) ) + 0x5A82_7999;
        return ( c ^ ( a & ( b ^ c ) ) ) + 0x5A82_7999;
    }

    function f1( a, b, c ) {
        return ( a ^ b ^ c ) + 0x6ED9_EBA1;
    }

    function f2( a, b, c ) {
//      return ( ( a & b ) | ( a & c ) | ( b & c ) ) + 0x8F1B_BCDC;
        return ( ( a & b ) | ( c & ( a | b ) ) ) + 0x8F1B_BCDC;
    }

    function f3( a, b, c ) {
        return ( a ^ b ^ c ) + 0xCA62_C1D6;
    }

    const FUNC = [ f0, f1, f2, f3 ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {

        // PADDING_BE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let className = "SHA1";

        let H0, H1, H2, H3, H4;

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, BIG_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, BIG_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, BIG_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, BIG_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, BIG_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, BIG_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, BIG_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, BIG_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, BIG_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, BIG_ENDIAN );
                let X10 = view.getUint32( ofs + 40, BIG_ENDIAN );
                let X11 = view.getUint32( ofs + 44, BIG_ENDIAN );
                let X12 = view.getUint32( ofs + 48, BIG_ENDIAN );
                let X13 = view.getUint32( ofs + 52, BIG_ENDIAN );
                let X14 = view.getUint32( ofs + 56, BIG_ENDIAN );
                let X15 = view.getUint32( ofs + 60, BIG_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3, E = H4;

                E = rol5( A ) + f0( B, C, D ) + E +  X0; B = rol30( B );
                D = rol5( E ) + f0( A, B, C ) + D +  X1; A = rol30( A );
                C = rol5( D ) + f0( E, A, B ) + C +  X2; E = rol30( E );
                B = rol5( C ) + f0( D, E, A ) + B +  X3; D = rol30( D );
                A = rol5( B ) + f0( C, D, E ) + A +  X4; C = rol30( C );
                E = rol5( A ) + f0( B, C, D ) + E +  X5; B = rol30( B );
                D = rol5( E ) + f0( A, B, C ) + D +  X6; A = rol30( A );
                C = rol5( D ) + f0( E, A, B ) + C +  X7; E = rol30( E );
                B = rol5( C ) + f0( D, E, A ) + B +  X8; D = rol30( D );
                A = rol5( B ) + f0( C, D, E ) + A +  X9; C = rol30( C );
                E = rol5( A ) + f0( B, C, D ) + E + X10; B = rol30( B );
                D = rol5( E ) + f0( A, B, C ) + D + X11; A = rol30( A );
                C = rol5( D ) + f0( E, A, B ) + C + X12; E = rol30( E );
                B = rol5( C ) + f0( D, E, A ) + B + X13; D = rol30( D );
                A = rol5( B ) + f0( C, D, E ) + A + X14; C = rol30( C );
                E = rol5( A ) + f0( B, C, D ) + E + X15; B = rol30( B );

                 X0 = rol1( X13 ^  X8 ^  X2 ^  X0 );
                  D = rol5( E ) + f0( A, B, C ) + D +  X0; A = rol30( A );
                 X1 = rol1( X14 ^  X9 ^  X3 ^  X1 );
                  C = rol5( D ) + f0( E, A, B ) + C +  X1; E = rol30( E );
                 X2 = rol1( X15 ^ X10 ^  X4 ^  X2 );
                  B = rol5( C ) + f0( D, E, A ) + B +  X2; D = rol30( D );
                 X3 = rol1(  X0 ^ X11 ^  X5 ^  X3 );
                  A = rol5( B ) + f0( C, D, E ) + A +  X3; C = rol30( C );
                 X4 = rol1(  X1 ^ X12 ^  X6 ^  X4 );
                  E = rol5( A ) + f1( B, C, D ) + E +  X4; B = rol30( B );
                 X5 = rol1(  X2 ^ X13 ^  X7 ^  X5 );
                  D = rol5( E ) + f1( A, B, C ) + D +  X5; A = rol30( A );
                 X6 = rol1(  X3 ^ X14 ^  X8 ^  X6 );
                  C = rol5( D ) + f1( E, A, B ) + C +  X6; E = rol30( E );
                 X7 = rol1(  X4 ^ X15 ^  X9 ^  X7 );
                  B = rol5( C ) + f1( D, E, A ) + B +  X7; D = rol30( D );
                 X8 = rol1(  X5 ^  X0 ^ X10 ^  X8 );
                  A = rol5( B ) + f1( C, D, E ) + A +  X8; C = rol30( C );
                 X9 = rol1(  X6 ^  X1 ^ X11 ^  X9 );
                  E = rol5( A ) + f1( B, C, D ) + E +  X9; B = rol30( B );
                X10 = rol1(  X7 ^  X2 ^ X12 ^ X10 );
                  D = rol5( E ) + f1( A, B, C ) + D + X10; A = rol30( A );
                X11 = rol1(  X8 ^  X3 ^ X13 ^ X11 );
                  C = rol5( D ) + f1( E, A, B ) + C + X11; E = rol30( E );
                X12 = rol1(  X9 ^  X4 ^ X14 ^ X12 );
                  B = rol5( C ) + f1( D, E, A ) + B + X12; D = rol30( D );
                X13 = rol1( X10 ^  X5 ^ X15 ^ X13 );
                  A = rol5( B ) + f1( C, D, E ) + A + X13; C = rol30( C );
                X14 = rol1( X11 ^  X6 ^  X0 ^ X14 );
                  E = rol5( A ) + f1( B, C, D ) + E + X14; B = rol30( B );
                X15 = rol1( X12 ^  X7 ^  X1 ^ X15 );
                  D = rol5( E ) + f1( A, B, C ) + D + X15; A = rol30( A );

                 X0 = rol1( X13 ^  X8 ^  X2 ^  X0 );
                  C = rol5( D ) + f1( E, A, B ) + C +  X0; E = rol30( E );
                 X1 = rol1( X14 ^  X9 ^  X3 ^  X1 );
                  B = rol5( C ) + f1( D, E, A ) + B +  X1; D = rol30( D );
                 X2 = rol1( X15 ^ X10 ^  X4 ^  X2 );
                  A = rol5( B ) + f1( C, D, E ) + A +  X2; C = rol30( C );
                 X3 = rol1(  X0 ^ X11 ^  X5 ^  X3 );
                  E = rol5( A ) + f1( B, C, D ) + E +  X3; B = rol30( B );
                 X4 = rol1(  X1 ^ X12 ^  X6 ^  X4 );
                  D = rol5( E ) + f1( A, B, C ) + D +  X4; A = rol30( A );
                 X5 = rol1(  X2 ^ X13 ^  X7 ^  X5 );
                  C = rol5( D ) + f1( E, A, B ) + C +  X5; E = rol30( E );
                 X6 = rol1(  X3 ^ X14 ^  X8 ^  X6 );
                  B = rol5( C ) + f1( D, E, A ) + B +  X6; D = rol30( D );
                 X7 = rol1(  X4 ^ X15 ^  X9 ^  X7 );
                  A = rol5( B ) + f1( C, D, E ) + A +  X7; C = rol30( C );
                 X8 = rol1(  X5 ^  X0 ^ X10 ^  X8 );
                  E = rol5( A ) + f2( B, C, D ) + E +  X8; B = rol30( B );
                 X9 = rol1(  X6 ^  X1 ^ X11 ^  X9 );
                  D = rol5( E ) + f2( A, B, C ) + D +  X9; A = rol30( A );
                X10 = rol1(  X7 ^  X2 ^ X12 ^ X10 );
                  C = rol5( D ) + f2( E, A, B ) + C + X10; E = rol30( E );
                X11 = rol1(  X8 ^  X3 ^ X13 ^ X11 );
                  B = rol5( C ) + f2( D, E, A ) + B + X11; D = rol30( D );
                X12 = rol1(  X9 ^  X4 ^ X14 ^ X12 );
                  A = rol5( B ) + f2( C, D, E ) + A + X12; C = rol30( C );
                X13 = rol1( X10 ^  X5 ^ X15 ^ X13 );
                  E = rol5( A ) + f2( B, C, D ) + E + X13; B = rol30( B );
                X14 = rol1( X11 ^  X6 ^  X0 ^ X14 );
                  D = rol5( E ) + f2( A, B, C ) + D + X14; A = rol30( A );
                X15 = rol1( X12 ^  X7 ^  X1 ^ X15 );
                  C = rol5( D ) + f2( E, A, B ) + C + X15; E = rol30( E );

                 X0 = rol1( X13 ^  X8 ^  X2 ^  X0 );
                  B = rol5( C ) + f2( D, E, A ) + B +  X0; D = rol30( D );
                 X1 = rol1( X14 ^  X9 ^  X3 ^  X1 );
                  A = rol5( B ) + f2( C, D, E ) + A +  X1; C = rol30( C );
                 X2 = rol1( X15 ^ X10 ^  X4 ^  X2 );
                  E = rol5( A ) + f2( B, C, D ) + E +  X2; B = rol30( B );
                 X3 = rol1(  X0 ^ X11 ^  X5 ^  X3 );
                  D = rol5( E ) + f2( A, B, C ) + D +  X3; A = rol30( A );
                 X4 = rol1(  X1 ^ X12 ^  X6 ^  X4 );
                  C = rol5( D ) + f2( E, A, B ) + C +  X4; E = rol30( E );
                 X5 = rol1(  X2 ^ X13 ^  X7 ^  X5 );
                  B = rol5( C ) + f2( D, E, A ) + B +  X5; D = rol30( D );
                 X6 = rol1(  X3 ^ X14 ^  X8 ^  X6 );
                  A = rol5( B ) + f2( C, D, E ) + A +  X6; C = rol30( C );
                 X7 = rol1(  X4 ^ X15 ^  X9 ^  X7 );
                  E = rol5( A ) + f2( B, C, D ) + E +  X7; B = rol30( B );
                 X8 = rol1(  X5 ^  X0 ^ X10 ^  X8 );
                  D = rol5( E ) + f2( A, B, C ) + D +  X8; A = rol30( A );
                 X9 = rol1(  X6 ^  X1 ^ X11 ^  X9 );
                  C = rol5( D ) + f2( E, A, B ) + C +  X9; E = rol30( E );
                X10 = rol1(  X7 ^  X2 ^ X12 ^ X10 );
                  B = rol5( C ) + f2( D, E, A ) + B + X10; D = rol30( D );
                X11 = rol1(  X8 ^  X3 ^ X13 ^ X11 );
                  A = rol5( B ) + f2( C, D, E ) + A + X11; C = rol30( C );
                X12 = rol1(  X9 ^  X4 ^ X14 ^ X12 );
                  E = rol5( A ) + f3( B, C, D ) + E + X12; B = rol30( B );
                X13 = rol1( X10 ^  X5 ^ X15 ^ X13 );
                  D = rol5( E ) + f3( A, B, C ) + D + X13; A = rol30( A );
                X14 = rol1( X11 ^  X6 ^  X0 ^ X14 );
                  C = rol5( D ) + f3( E, A, B ) + C + X14; E = rol30( E );
                X15 = rol1( X12 ^  X7 ^  X1 ^ X15 );
                  B = rol5( C ) + f3( D, E, A ) + B + X15; D = rol30( D );

                 X0 = rol1( X13 ^  X8 ^  X2 ^  X0 );
                  A = rol5( B ) + f3( C, D, E ) + A +  X0; C = rol30( C );
                 X1 = rol1( X14 ^  X9 ^  X3 ^  X1 );
                  E = rol5( A ) + f3( B, C, D ) + E +  X1; B = rol30( B );
                 X2 = rol1( X15 ^ X10 ^  X4 ^  X2 );
                  D = rol5( E ) + f3( A, B, C ) + D +  X2; A = rol30( A );
                 X3 = rol1(  X0 ^ X11 ^  X5 ^  X3 );
                  C = rol5( D ) + f3( E, A, B ) + C +  X3; E = rol30( E );
                 X4 = rol1(  X1 ^ X12 ^  X6 ^  X4 );
                  B = rol5( C ) + f3( D, E, A ) + B +  X4; D = rol30( D );
                 X5 = rol1(  X2 ^ X13 ^  X7 ^  X5 );
                  A = rol5( B ) + f3( C, D, E ) + A +  X5; C = rol30( C );
                 X6 = rol1(  X3 ^ X14 ^  X8 ^  X6 );
                  E = rol5( A ) + f3( B, C, D ) + E +  X6; B = rol30( B );
                 X7 = rol1(  X4 ^ X15 ^  X9 ^  X7 );
                  D = rol5( E ) + f3( A, B, C ) + D +  X7; A = rol30( A );
                 X8 = rol1(  X5 ^  X0 ^ X10 ^  X8 );
                  C = rol5( D ) + f3( E, A, B ) + C +  X8; E = rol30( E );
                 X9 = rol1(  X6 ^  X1 ^ X11 ^  X9 );
                  B = rol5( C ) + f3( D, E, A ) + B +  X9; D = rol30( D );
                X10 = rol1(  X7 ^  X2 ^ X12 ^ X10 );
                  A = rol5( B ) + f3( C, D, E ) + A + X10; C = rol30( C );
                X11 = rol1(  X8 ^  X3 ^ X13 ^ X11 );
                  E = rol5( A ) + f3( B, C, D ) + E + X11; B = rol30( B );
                X12 = rol1(  X9 ^  X4 ^ X14 ^ X12 );
                  D = rol5( E ) + f3( A, B, C ) + D + X12; A = rol30( A );
                X13 = rol1( X10 ^  X5 ^ X15 ^ X13 );
                  C = rol5( D ) + f3( E, A, B ) + C + X13; E = rol30( E );
                X14 = rol1( X11 ^  X6 ^  X0 ^ X14 );
                  B = rol5( C ) + f3( D, E, A ) + B + X14; D = rol30( D );
                X15 = rol1( X12 ^  X7 ^  X1 ^ X15 );
                  A = rol5( B ) + f3( C, D, E ) + A + X15; C = rol30( C );

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
                H4 = ( H4 + E ) & 0xFFFF_FFFF;
            }
        }
        else {
            className += "-mini";

            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, BIG_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3, E = H4;

                let j = 0, k = 20;
                for( let i = 0; i < 80; i++ ) {
                    if( i >= 16 ) {
                        X[i & 15] = rol( X[( i - 3 ) & 15] ^ X[( i - 8 ) & 15]
                            ^ X[( i - 14 ) & 15] ^ X[i & 15], 1 );
                    }
                    if( i >= k ) {
                        j++;
                        k += 20;
                    }
                    E = rol( A, 5 ) + FUNC[j]( B, C, D ) + E + X[i & 15]; B = rol( B, 30 );

                    const tmp = A; A = E; E = D; D = C; C = B; B = tmp;
                }

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
                H4 = ( H4 + E ) & 0xFFFF_FFFF;
            }
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE ) );
            [ H0, H1, H2, H3, H4 ].forEach(
                ( e, i ) => view.setUint32( 4 * i, e, BIG_ENDIAN )
            );
            this.hash = view.buffer;
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = 0x6745_2301;
            H1 = 0xEFCD_AB89;
            H2 = 0x98BA_DCFE;
            H3 = 0x1032_5476;
            H4 = 0xC3D2_E1F0;
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha1ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA256BASE
const SHA256BASE = ( function() {

    const superClass = PADDING_BE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE_MAX = 32;

    const K = [
        0x428A_2F98, 0x7137_4491, 0xB5C0_FBCF, 0xE9B5_DBA5, 0x3956_C25B, 0x59F1_11F1, 0x923F_82A4, 0xAB1C_5ED5,
        0xD807_AA98, 0x1283_5B01, 0x2431_85BE, 0x550C_7DC3, 0x72BE_5D74, 0x80DE_B1FE, 0x9BDC_06A7, 0xC19B_F174,
        0xE49B_69C1, 0xEFBE_4786, 0x0FC1_9DC6, 0x240C_A1CC, 0x2DE9_2C6F, 0x4A74_84AA, 0x5CB0_A9DC, 0x76F9_88DA,
        0x983E_5152, 0xA831_C66D, 0xB003_27C8, 0xBF59_7FC7, 0xC6E0_0BF3, 0xD5A7_9147, 0x06CA_6351, 0x1429_2967,
        0x27B7_0A85, 0x2E1B_2138, 0x4D2C_6DFC, 0x5338_0D13, 0x650A_7354, 0x766A_0ABB, 0x81C2_C92E, 0x9272_2C85,
        0xA2BF_E8A1, 0xA81A_664B, 0xC24B_8B70, 0xC76C_51A3, 0xD192_E819, 0xD699_0624, 0xF40E_3585, 0x106A_A070,
        0x19A4_C116, 0x1E37_6C08, 0x2748_774C, 0x34B0_BCB5, 0x391C_0CB3, 0x4ED8_AA4A, 0x5B9C_CA4F, 0x682E_6FF3,
        0x748F_82EE, 0x78A5_636F, 0x84C8_7814, 0x8CC7_0208, 0x90BE_FFFA, 0xA450_6CEB, 0xBEF9_A3F7, 0xC671_78F2
    ];

    function ror( a, b ) {
        return ( a >>> b ) | ( a << -b );
    }

    function s0( a ) {
        return ror( a, 7 ) ^ ror( a, 18 ) ^ ( a >>> 3 );
    }

    function s1( a ) {
        return ror( a, 17 ) ^ ror( a, 19 ) ^ ( a >>> 10 );
    }

    function f0( a, b, c ) {
//      return ( ( a & b ) ^ ( a & c ) ^ ( b & c ) )
        return ( ( a & b ) | ( c & ( a | b ) ) )
            + ( ror( a, 2 ) ^ ror( a, 13 ) ^ ror( a, 22 ) );
    }

    function f1( a, b, c ) {
//      return ( ( a & b ) ^ ( ( ~ a ) & c ) )
        return ( c ^ ( a & ( b ^ c ) ) )
            + ( ror( a, 6 ) ^ ror( a, 11 ) ^ ror( a, 25 ) );
    }

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( IV, hashSizeBits, unrolled ) {

        // PADDING_BE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let className = "SHA" + hashSizeBits;

        let H0, H1, H2, H3, H4, H5, H6, H7;

        if( unrolled ) {
            className += "-unrolled";

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, BIG_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, BIG_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, BIG_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, BIG_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, BIG_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, BIG_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, BIG_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, BIG_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, BIG_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, BIG_ENDIAN );
                let X10 = view.getUint32( ofs + 40, BIG_ENDIAN );
                let X11 = view.getUint32( ofs + 44, BIG_ENDIAN );
                let X12 = view.getUint32( ofs + 48, BIG_ENDIAN );
                let X13 = view.getUint32( ofs + 52, BIG_ENDIAN );
                let X14 = view.getUint32( ofs + 56, BIG_ENDIAN );
                let X15 = view.getUint32( ofs + 60, BIG_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3,
                    E = H4, F = H5, G = H6, H = H7;

                H += f1( E, F, G ) + 0x428A_2F98 +  X0; D += H; H += f0( A, B, C );
                G += f1( D, E, F ) + 0x7137_4491 +  X1; C += G; G += f0( H, A, B );
                F += f1( C, D, E ) + 0xB5C0_FBCF +  X2; B += F; F += f0( G, H, A );
                E += f1( B, C, D ) + 0xE9B5_DBA5 +  X3; A += E; E += f0( F, G, H );
                D += f1( A, B, C ) + 0x3956_C25B +  X4; H += D; D += f0( E, F, G );
                C += f1( H, A, B ) + 0x59F1_11F1 +  X5; G += C; C += f0( D, E, F );
                B += f1( G, H, A ) + 0x923F_82A4 +  X6; F += B; B += f0( C, D, E );
                A += f1( F, G, H ) + 0xAB1C_5ED5 +  X7; E += A; A += f0( B, C, D );
                H += f1( E, F, G ) + 0xD807_AA98 +  X8; D += H; H += f0( A, B, C );
                G += f1( D, E, F ) + 0x1283_5B01 +  X9; C += G; G += f0( H, A, B );
                F += f1( C, D, E ) + 0x2431_85BE + X10; B += F; F += f0( G, H, A );
                E += f1( B, C, D ) + 0x550C_7DC3 + X11; A += E; E += f0( F, G, H );
                D += f1( A, B, C ) + 0x72BE_5D74 + X12; H += D; D += f0( E, F, G );
                C += f1( H, A, B ) + 0x80DE_B1FE + X13; G += C; C += f0( D, E, F );
                B += f1( G, H, A ) + 0x9BDC_06A7 + X14; F += B; B += f0( C, D, E );
                A += f1( F, G, H ) + 0xC19B_F174 + X15; E += A; A += f0( B, C, D );

                 X0 += s0(  X1 ) +  X9 + s1( X14 );
                  H += f1( E, F, G ) + 0xE49B_69C1 +  X0; D += H; H += f0( A, B, C );
                 X1 += s0(  X2 ) + X10 + s1( X15 );
                  G += f1( D, E, F ) + 0xEFBE_4786 +  X1; C += G; G += f0( H, A, B );
                 X2 += s0(  X3 ) + X11 + s1(  X0 );
                  F += f1( C, D, E ) + 0x0FC1_9DC6 +  X2; B += F; F += f0( G, H, A );
                 X3 += s0(  X4 ) + X12 + s1(  X1 );
                  E += f1( B, C, D ) + 0x240C_A1CC +  X3; A += E; E += f0( F, G, H );
                 X4 += s0(  X5 ) + X13 + s1(  X2 );
                  D += f1( A, B, C ) + 0x2DE9_2C6F +  X4; H += D; D += f0( E, F, G );
                 X5 += s0(  X6 ) + X14 + s1(  X3 );
                  C += f1( H, A, B ) + 0x4A74_84AA +  X5; G += C; C += f0( D, E, F );
                 X6 += s0(  X7 ) + X15 + s1(  X4 );
                  B += f1( G, H, A ) + 0x5CB0_A9DC +  X6; F += B; B += f0( C, D, E );
                 X7 += s0(  X8 ) +  X0 + s1(  X5 );
                  A += f1( F, G, H ) + 0x76F9_88DA +  X7; E += A; A += f0( B, C, D );
                 X8 += s0(  X9 ) +  X1 + s1(  X6 );
                  H += f1( E, F, G ) + 0x983E_5152 +  X8; D += H; H += f0( A, B, C );
                 X9 += s0( X10 ) +  X2 + s1(  X7 );
                  G += f1( D, E, F ) + 0xA831_C66D +  X9; C += G; G += f0( H, A, B );
                X10 += s0( X11 ) +  X3 + s1(  X8 );
                  F += f1( C, D, E ) + 0xB003_27C8 + X10; B += F; F += f0( G, H, A );
                X11 += s0( X12 ) +  X4 + s1(  X9 );
                  E += f1( B, C, D ) + 0xBF59_7FC7 + X11; A += E; E += f0( F, G, H );
                X12 += s0( X13 ) +  X5 + s1( X10 );
                  D += f1( A, B, C ) + 0xC6E0_0BF3 + X12; H += D; D += f0( E, F, G );
                X13 += s0( X14 ) +  X6 + s1( X11 );
                  C += f1( H, A, B ) + 0xD5A7_9147 + X13; G += C; C += f0( D, E, F );
                X14 += s0( X15 ) +  X7 + s1( X12 );
                  B += f1( G, H, A ) + 0x06CA_6351 + X14; F += B; B += f0( C, D, E );
                X15 += s0(  X0 ) +  X8 + s1( X13 );
                  A += f1( F, G, H ) + 0x1429_2967 + X15; E += A; A += f0( B, C, D );

                 X0 += s0(  X1 ) +  X9 + s1( X14 );
                  H += f1( E, F, G ) + 0x27B7_0A85 +  X0; D += H; H += f0( A, B, C );
                 X1 += s0(  X2 ) + X10 + s1( X15 );
                  G += f1( D, E, F ) + 0x2E1B_2138 +  X1; C += G; G += f0( H, A, B );
                 X2 += s0(  X3 ) + X11 + s1(  X0 );
                  F += f1( C, D, E ) + 0x4D2C_6DFC +  X2; B += F; F += f0( G, H, A );
                 X3 += s0(  X4 ) + X12 + s1(  X1 );
                  E += f1( B, C, D ) + 0x5338_0D13 +  X3; A += E; E += f0( F, G, H );
                 X4 += s0(  X5 ) + X13 + s1(  X2 );
                  D += f1( A, B, C ) + 0x650A_7354 +  X4; H += D; D += f0( E, F, G );
                 X5 += s0(  X6 ) + X14 + s1(  X3 );
                  C += f1( H, A, B ) + 0x766A_0ABB +  X5; G += C; C += f0( D, E, F );
                 X6 += s0(  X7 ) + X15 + s1(  X4 );
                  B += f1( G, H, A ) + 0x81C2_C92E +  X6; F += B; B += f0( C, D, E );
                 X7 += s0(  X8 ) +  X0 + s1(  X5 );
                  A += f1( F, G, H ) + 0x9272_2C85 +  X7; E += A; A += f0( B, C, D );
                 X8 += s0(  X9 ) +  X1 + s1(  X6 );
                  H += f1( E, F, G ) + 0xA2BF_E8A1 +  X8; D += H; H += f0( A, B, C );
                 X9 += s0( X10 ) +  X2 + s1(  X7 );
                  G += f1( D, E, F ) + 0xA81A_664B +  X9; C += G; G += f0( H, A, B );
                X10 += s0( X11 ) +  X3 + s1(  X8 );
                  F += f1( C, D, E ) + 0xC24B_8B70 + X10; B += F; F += f0( G, H, A );
                X11 += s0( X12 ) +  X4 + s1(  X9 );
                  E += f1( B, C, D ) + 0xC76C_51A3 + X11; A += E; E += f0( F, G, H );
                X12 += s0( X13 ) +  X5 + s1( X10 );
                  D += f1( A, B, C ) + 0xD192_E819 + X12; H += D; D += f0( E, F, G );
                X13 += s0( X14 ) +  X6 + s1( X11 );
                  C += f1( H, A, B ) + 0xD699_0624 + X13; G += C; C += f0( D, E, F );
                X14 += s0( X15 ) +  X7 + s1( X12 );
                  B += f1( G, H, A ) + 0xF40E_3585 + X14; F += B; B += f0( C, D, E );
                X15 += s0(  X0 ) +  X8 + s1( X13 );
                 A += f1( F, G, H ) + 0x106A_A070 + X15; E += A; A += f0( B, C, D );

                 X0 += s0(  X1 ) +  X9 + s1( X14 );
                  H += f1( E, F, G ) + 0x19A4_C116 +  X0; D += H; H += f0( A, B, C );
                 X1 += s0(  X2 ) + X10 + s1( X15 );
                  G += f1( D, E, F ) + 0x1E37_6C08 +  X1; C += G; G += f0( H, A, B );
                 X2 += s0(  X3 ) + X11 + s1(  X0 );
                  F += f1( C, D, E ) + 0x2748_774C +  X2; B += F; F += f0( G, H, A );
                 X3 += s0(  X4 ) + X12 + s1(  X1 );
                  E += f1( B, C, D ) + 0x34B0_BCB5 +  X3; A += E; E += f0( F, G, H );
                 X4 += s0(  X5 ) + X13 + s1(  X2 );
                  D += f1( A, B, C ) + 0x391C_0CB3 +  X4; H += D; D += f0( E, F, G );
                 X5 += s0(  X6 ) + X14 + s1(  X3 );
                  C += f1( H, A, B ) + 0x4ED8_AA4A +  X5; G += C; C += f0( D, E, F );
                 X6 += s0(  X7 ) + X15 + s1(  X4 );
                  B += f1( G, H, A ) + 0x5B9C_CA4F +  X6; F += B; B += f0( C, D, E );
                 X7 += s0(  X8 ) +  X0 + s1(  X5 );
                  A += f1( F, G, H ) + 0x682E_6FF3 +  X7; E += A; A += f0( B, C, D );
                 X8 += s0(  X9 ) +  X1 + s1(  X6 );
                  H += f1( E, F, G ) + 0x748F_82EE +  X8; D += H; H += f0( A, B, C );
                 X9 += s0( X10 ) +  X2 + s1(  X7 );
                  G += f1( D, E, F ) + 0x78A5_636F +  X9; C += G; G += f0( H, A, B );
                X10 += s0( X11 ) +  X3 + s1(  X8 );
                  F += f1( C, D, E ) + 0x84C8_7814 + X10; B += F; F += f0( G, H, A );
                X11 += s0( X12 ) +  X4 + s1(  X9 );
                  E += f1( B, C, D ) + 0x8CC7_0208 + X11; A += E; E += f0( F, G, H );
                X12 += s0( X13 ) +  X5 + s1( X10 );
                  D += f1( A, B, C ) + 0x90BE_FFFA + X12; H += D; D += f0( E, F, G );
                X13 += s0( X14 ) +  X6 + s1( X11 );
                  C += f1( H, A, B ) + 0xA450_6CEB + X13; G += C; C += f0( D, E, F );
                X14 += s0( X15 ) +  X7 + s1( X12 );
                  B += f1( G, H, A ) + 0xBEF9_A3F7 + X14; F += B; B += f0( C, D, E );
                X15 += s0(  X0 ) +  X8 + s1( X13 );
                  A += f1( F, G, H ) + 0xC671_78F2 + X15; E += A; A += f0( B, C, D );

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
                H4 = ( H4 + E ) & 0xFFFF_FFFF;
                H5 = ( H5 + F ) & 0xFFFF_FFFF;
                H6 = ( H6 + G ) & 0xFFFF_FFFF;
                H7 = ( H7 + H ) & 0xFFFF_FFFF;
            };
        }
        else {
            className += "-mini";

            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, BIG_ENDIAN );

                let A = H0, B = H1, C = H2, D = H3,
                    E = H4, F = H5, G = H6, H = H7;

                for( let i = 0; i < 64; i++ ) {
                    if( i >= 16 )
                        X[i & 15] += s0( X[( i - 15 ) & 15] ) + X[( i - 7 ) & 15]
                            + s1( X[( i - 2 ) & 15] );

                    H += f1( E, F, G ) + K[i] + X[i & 15]; D += H; H += f0( A, B, C );

                    const tmp = A; A = H; H = G; G = F; F = E; E = D;
                            D = C; C = B; B = tmp;
                }

                H0 = ( H0 + A ) & 0xFFFF_FFFF;
                H1 = ( H1 + B ) & 0xFFFF_FFFF;
                H2 = ( H2 + C ) & 0xFFFF_FFFF;
                H3 = ( H3 + D ) & 0xFFFF_FFFF;
                H4 = ( H4 + E ) & 0xFFFF_FFFF;
                H5 = ( H5 + F ) & 0xFFFF_FFFF;
                H6 = ( H6 + G ) & 0xFFFF_FFFF;
                H7 = ( H7 + H ) & 0xFFFF_FFFF;
            };
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
            [ H0, H1, H2, H3, H4, H5, H6, H7 ]
                .forEach( ( e, i ) => view.setUint32( 4 * i, e, BIG_ENDIAN ) );
            this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
        }

        const initOverloaded = this.init;
        this.init = function() {
            superClass.prototype.init.call( this );

            H0 = IV[0];
            H1 = IV[1];
            H2 = IV[2];
            H3 = IV[3];
            H4 = IV[4];
            H5 = IV[5];
            H6 = IV[6];
            H7 = IV[7];
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    return thisClass;
} )();

/**********************************************************************/

// class SHA224
const SHA224 = ( function() {

    const superClass = SHA256BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha224ref = new Map( [
        // ""
        [ 0, "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f" ],
        // "a"
        [ 1, "abd37534c7d9a2efb9465de931cd7055ffdb8879563ae98078d6d6d5" ],
        // "abc"
        [ 2, "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7" ],
        // "\x55".repeat( 56 )
        [ 3, "0696caaceec9da0c4f384793313f4bb709fec46c72a57931f2d67503" ],
        // "\xaa".repeat( 112 )
        [ 4, "775f4099dce0bb1c9d330764534d016c424af482b01a2ee0a7348d9d" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "77c4a325dd93ae83308ade43cde535e432db6dc068ee9c52b3851a0e" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "a8dbad2d05691154be635880f8d0f9ed2e4b6621c50819e04df8cf7a" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "b795e7fc24bbbb7e6ddce57edd3d5b1226c8577edbb88c3c298bbf32" ]
    ] );

    const IV = [
        0xC105_9ED8, 0x367C_D507, 0x3070_DD17, 0xF70E_5939,
        0xFFC0_0B31, 0x6858_1511, 0x64F9_8FA7, 0xBEFA_4FA4
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 224, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha224ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA256
const SHA256 = ( function() {

    const superClass = SHA256BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha256ref = new Map( [
        // ""
        [ 0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ],
        // "a"
        [ 1, "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb" ],
        // "abc"
        [ 2, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" ],
        // "\x55".repeat( 56 )
        [ 3, "90570b9db692e826bc3ef8b440d8e9bafacc78220abd270ed1f929bcab88029f" ],
        // "\xaa".repeat( 112 )
        [ 4, "be8d7f73d969fd4f5378f8875a796df28ccda97877e1f14df4f2363cf8ed1ac8" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "a8603edb9889dddf74ea7a99bb846ebf5e430a88d6c28aeb99020c614acf272d" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "ced8261ae3cf93c9d8074de4589bc81b66a5b5eaa7e2a3b4ea22e6d0b6f35a31" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "2daeb1f36095b44b318410b3f4e8b5d989dcc7bb023d1426c492dab0a3053e74" ]
    ] );

    const IV = [
        0x6A09_E667, 0xBB67_AE85, 0x3C6E_F372, 0xA54F_F53A,
        0x510E_527F, 0x9B05_688C, 0x1F83_D9AB, 0x5BE0_CD19
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 256, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha256ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// abstract class PADDING_BLAKE
const PADDING_BLAKE = ( function() {

    const superClass = HASH;

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function () {
        // nothing to do here
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.init = function() {
        superClass.prototype.init.call( this );

        // needed for special last block treatment
        this.dataBlockSize = this.blockSize;
        this.isLastBlock = false;
    };

    thisClass.prototype.pad = function() {
        let padSize = this.blockSize - this.remains.byteLength;

        // special special last block treatment
        this.dataBlockSize = this.remains.byteLength;
        this.isLastBlock = true;

        return new ArrayBuffer( padSize );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2sBASE
const BLAKE2sBASE = ( function() {

    const superClass = PADDING_BLAKE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE_MAX = 32;

    const IV0 = 0x6A09_E667, IV1 = 0xBB67_AE85,
          IV2 = 0x3C6E_F372, IV3 = 0xA54F_F53A,
          IV4 = 0x510E_527F, IV5 = 0x9B05_688C,
          IV6 = 0x1F83_D9AB, IV7 = 0x5BE0_CD19;

    const IV = [ IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7 ];

    const S = [
        [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ],
        [ 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 ],
        [ 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4 ],
        [ 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8 ],
        [ 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13 ],
        [ 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9 ],
        [ 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11 ],
        [ 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10 ],
        [ 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5 ],
        [ 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0 ]
    ];

    function ror( a, b ) {
        return ( a >>> b ) | ( a << -b );
    }

    function ror7( a ) {
        return ( a >>> 7 ) | ( a << -7 );
    }

    function ror8( a ) {
        return ( a >>> 8 ) | ( a << -8 );
    }

    function ror12( a ) {
        return ( a >>> 12 ) | ( a << -12 );
    }

    function ror16( a ) {
        return ( a >>> 16 ) | ( a << -16 );
    }

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( hashSizeBits, unrolled ) {

        // PADDING_BLAKE.call( this ); // no need calling empty constructor
        HASH.call( this, 64 );

        let className = "BLAKE2s" + hashSizeBits;

        if( unrolled ) {
            className += "-unrolled";

            let H0, H1, H2, H3, H4, H5, H6, H7;

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let  X0 = view.getUint32( ofs +  0, LITTLE_ENDIAN );
                let  X1 = view.getUint32( ofs +  4, LITTLE_ENDIAN );
                let  X2 = view.getUint32( ofs +  8, LITTLE_ENDIAN );
                let  X3 = view.getUint32( ofs + 12, LITTLE_ENDIAN );
                let  X4 = view.getUint32( ofs + 16, LITTLE_ENDIAN );
                let  X5 = view.getUint32( ofs + 20, LITTLE_ENDIAN );
                let  X6 = view.getUint32( ofs + 24, LITTLE_ENDIAN );
                let  X7 = view.getUint32( ofs + 28, LITTLE_ENDIAN );
                let  X8 = view.getUint32( ofs + 32, LITTLE_ENDIAN );
                let  X9 = view.getUint32( ofs + 36, LITTLE_ENDIAN );
                let X10 = view.getUint32( ofs + 40, LITTLE_ENDIAN );
                let X11 = view.getUint32( ofs + 44, LITTLE_ENDIAN );
                let X12 = view.getUint32( ofs + 48, LITTLE_ENDIAN );
                let X13 = view.getUint32( ofs + 52, LITTLE_ENDIAN );
                let X14 = view.getUint32( ofs + 56, LITTLE_ENDIAN );
                let X15 = view.getUint32( ofs + 60, LITTLE_ENDIAN );

                let  V0 =  H0,  V1 =  H1,  V2 =  H2,  V3 =  H3,
                     V4 =  H4,  V5 =  H5,  V6 =  H6,  V7 =  H7,
                     V8 = IV0,  V9 = IV1, V10 = IV2, V11 = IV3,
                    V12 = IV4, V13 = IV5, V14 = IV6, V15 = IV7;

                const T = this.byteLength + this.dataBlockSize;
                // assuming Number.isSafeInteger( T ) to be true!
                V12 ^= T;
                V13 ^= T / 2**32;
                if( this.isLastBlock )
                    V14 = ~V14;

                V0 += V4 +  X0; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X1; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X2; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X3; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X4; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X5; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X6; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X7; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X8; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X9; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 + X10; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 + X11; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 + X12; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 + X13; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 + X14; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 + X15; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 + X14; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 + X10; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X4; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X8; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X9; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 + X15; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 + X13; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X6; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X1; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 + X12; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X0; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X2; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 + X11; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X7; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X5; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X3; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 + X11; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X8; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 + X12; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X0; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X5; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X2; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 + X15; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 + X13; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 + X10; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 + X14; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X3; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X6; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X7; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X1; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X9; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X4; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 +  X7; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X9; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X3; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X1; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 + X13; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 + X12; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 + X11; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 + X14; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X2; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X6; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X5; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 + X10; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X4; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X0; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 + X15; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X8; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 +  X9; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X0; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X5; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X7; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X2; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X4; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 + X10; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 + X15; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 + X14; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X1; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 + X11; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 + X12; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X6; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X8; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X3; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 + X13; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 +  X2; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 + X12; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X6; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 + X10; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X0; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 + X11; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X8; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X3; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X4; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 + X13; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X7; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X5; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 + X15; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 + X14; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X1; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X9; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 + X12; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X5; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X1; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 + X15; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 + X14; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 + X13; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X4; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 + X10; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X0; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X7; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X6; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X3; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X9; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X2; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X8; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 + X11; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 + X13; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 + X11; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X7; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 + X14; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 + X12; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X1; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X3; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X9; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 +  X5; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X0; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 + X15; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X4; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X8; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X6; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 +  X2; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 + X10; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 +  X6; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 + X15; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 + X14; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X9; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 + X11; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X3; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X0; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X8; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 + X12; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 +  X2; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 + X13; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 +  X7; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X1; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 +  X4; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 + X10; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X5; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );
                V0 += V4 + X10; V12 = ror16( V12 ^ V0 );  V8 += V12; V4 = ror12( V4 ^  V8 );
                V0 += V4 +  X2; V12 =  ror8( V12 ^ V0 );  V8 += V12; V4 =  ror7( V4 ^  V8 );
                V1 += V5 +  X8; V13 = ror16( V13 ^ V1 );  V9 += V13; V5 = ror12( V5 ^  V9 );
                V1 += V5 +  X4; V13 =  ror8( V13 ^ V1 );  V9 += V13; V5 =  ror7( V5 ^  V9 );
                V2 += V6 +  X7; V14 = ror16( V14 ^ V2 ); V10 += V14; V6 = ror12( V6 ^ V10 );
                V2 += V6 +  X6; V14 =  ror8( V14 ^ V2 ); V10 += V14; V6 =  ror7( V6 ^ V10 );
                V3 += V7 +  X1; V15 = ror16( V15 ^ V3 ); V11 += V15; V7 = ror12( V7 ^ V11 );
                V3 += V7 +  X5; V15 =  ror8( V15 ^ V3 ); V11 += V15; V7 =  ror7( V7 ^ V11 );
                V0 += V5 + X15; V15 = ror16( V15 ^ V0 ); V10 += V15; V5 = ror12( V5 ^ V10 );
                V0 += V5 + X11; V15 =  ror8( V15 ^ V0 ); V10 += V15; V5 =  ror7( V5 ^ V10 );
                V1 += V6 +  X9; V12 = ror16( V12 ^ V1 ); V11 += V12; V6 = ror12( V6 ^ V11 );
                V1 += V6 + X14; V12 =  ror8( V12 ^ V1 ); V11 += V12; V6 =  ror7( V6 ^ V11 );
                V2 += V7 +  X3; V13 = ror16( V13 ^ V2 );  V8 += V13; V7 = ror12( V7 ^  V8 );
                V2 += V7 + X12; V13 =  ror8( V13 ^ V2 );  V8 += V13; V7 =  ror7( V7 ^  V8 );
                V3 += V4 + X13; V14 = ror16( V14 ^ V3 );  V9 += V14; V4 = ror12( V4 ^  V9 );
                V3 += V4 +  X0; V14 =  ror8( V14 ^ V3 );  V9 += V14; V4 =  ror7( V4 ^  V9 );

                H0 ^= V0 ^  V8;
                H1 ^= V1 ^  V9;
                H2 ^= V2 ^ V10;
                H3 ^= V3 ^ V11;
                H4 ^= V4 ^ V12;
                H5 ^= V5 ^ V13;
                H6 ^= V6 ^ V14;
                H7 ^= V7 ^ V15;
            }

            this.finalize = function() {
                const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
                [ H0, H1, H2, H3, H4, H5, H6, H7 ]
                    .forEach( ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN )
                );
                this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
            }

            this.init = function() {
                superClass.prototype.init.call( this );

                H0 = IV0 ^ 0x0101_0000 ^ ( hashSizeBits >> 3 );
                H1 = IV1;
                H2 = IV2;
                H3 = IV3;
                H4 = IV4;
                H5 = IV5;
                H6 = IV6;
                H7 = IV7;
            };
        }
        else {
            className += "-mini";

            // pre-allocating arrays, their instances MUST NOT change
            const H = new Array( 8 ).fill( 0 );
            const X = new Array( 16 ).fill( 0 );

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                let V = H.concat( IV );

                function G( a, b, c, d, x, y ) {
                    V[a] += V[b] + x;
                    V[d] = ror16( V[d] ^ V[a] );
                    V[c] += V[d];
                    V[b] = ror12( V[b] ^ V[c] );
                    V[a] += V[b] + y;
                    V[d] = ror8( V[d] ^ V[a] );
                    V[c] += V[d];
                    V[b] = ror7( V[b] ^ V[c] );
                }

                for( let i = 0; i < X.length; i++ )
                    X[i] = view.getUint32( ofs + 4 * i, LITTLE_ENDIAN );

                const T = this.byteLength + this.dataBlockSize;
                // assuming Number.isSafeInteger( T ) to be true!
                V[12] ^= T;
                V[13] ^= T / 2**32;
                if( this.isLastBlock )
                    V[14] = ~V[14];

                for( let i = 0; i < 10; i++ ) {
                    const SI = S[i];
                    G( 0, 4,  8, 12, X[SI[ 0]], X[SI[ 1]] );
                    G( 1, 5,  9, 13, X[SI[ 2]], X[SI[ 3]] );
                    G( 2, 6, 10, 14, X[SI[ 4]], X[SI[ 5]] );
                    G( 3, 7, 11, 15, X[SI[ 6]], X[SI[ 7]] );
                    G( 0, 5, 10, 15, X[SI[ 8]], X[SI[ 9]] );
                    G( 1, 6, 11, 12, X[SI[10]], X[SI[11]] );
                    G( 2, 7,  8, 13, X[SI[12]], X[SI[13]] );
                    G( 3, 4,  9, 14, X[SI[14]], X[SI[15]] );
                }

                for( let i = 0; i < 8; i++ )
                    H[i] ^= V[i] ^ V[i + 8];
            }

            this.finalize = function() {
                const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
                H.forEach( ( e, i ) => view.setUint32( 4 * i, e, LITTLE_ENDIAN ) );
                this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
            }

            this.init = function() {
                superClass.prototype.init.call( this );

                IV.forEach( ( iv, i ) => H[i] = iv );
                H[0] = IV[0] ^ 0x0101_0000 ^ ( hashSizeBits >> 3 );
            };
        }

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2s128
const BLAKE2s128 = ( function() {

    const superClass = BLAKE2sBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2s128ref = new Map( [
        // ""
        [ 0, "64550d6ffe2c0a01a14aba1eade0200c" ],
        // "a"
        [ 1, "854b9e9ba49bfd9457d4c3bf96e42523" ],
        // "abc"
        [ 2, "aa4938119b1dc7b87cbad0ffd200d0ae" ],
        // "\x55".repeat( 56 )
        [ 3, "86df61ffe5e8438052a44c13184c84a2" ],
        // "\xaa".repeat( 112 )
        [ 4, "3e7212086a54b06220501d8a75c1d28f" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "ffbd77d560a566ee25e022953fbb0dae" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "072f5285c48561b7bdff7b082176f823" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "79bdf759c4dd9ae6da10a31a00480b27" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 128, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2s128ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2s160
const BLAKE2s160 = ( function() {

    const superClass = BLAKE2sBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2s160ref = new Map( [
        // ""
        [ 0, "354c9c33f735962418bdacb9479873429c34916f" ],
        // "a"
        [ 1, "d9cd2bec1a24404b6588a55b191c7833d630bad8" ],
        // "abc"
        [ 2, "5ae3b99be29b01834c3b508521ede60438f8de17" ],
        // "\x55".repeat( 56 )
        [ 3, "2031007bcba5ecc8b508a1619d35985c51c03c7c" ],
        // "\xaa".repeat( 112 )
        [ 4, "44d516b6a68172c08bf48af4bbccec925949b318" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "001a5e0731c8454bff1a84268e638423b0ff7d42" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "1333272517e624e2b4b05bc7dfdab9923757264b" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "768953ab1e5f9d89cd0568b5b1c835bdd4a3ef04" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 160, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2s160ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2s224
const BLAKE2s224 = ( function() {

    const superClass = BLAKE2sBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2s224ref = new Map( [
        // ""
        [ 0, "1fa1291e65248b37b3433475b2a0dd63d54a11ecc4e3e034e7bc1ef4" ],
        // "a"
        [ 1, "726ab9ea46d69ae3b4440d02255ab73b256df1afb5587fb38b92512e" ],
        // "abc"
        [ 2, "0b033fc226df7abde29f67a05d3dc62cf271ef3dfea4d387407fbd55" ],
        // "\x55".repeat( 56 )
        [ 3, "078595ef1fa3251eac36c9ae630b0f55c64b0f2f01018c6ce75ffb30" ],
        // "\xaa".repeat( 112 )
        [ 4, "7c606cae9c7eaae55e0e8899748507929d1ad42c7c3cd4048eeee1c1" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "9b20b470ad05086d6f3f4cdcd5040f3ff5fa36824de2d5df4416638b" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "cf44735f198ce67588f3891faf763c41ebf235bd43575db42f54ce19" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "9eb0192b4991331a75cf4fa9447a4223345e0b8ffcbbfc1971dab995" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 224, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2s224ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2s256
const BLAKE2s256 = ( function() {

    const superClass = BLAKE2sBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2s256ref = new Map( [
        // ""
        [ 0, "69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9" ],
        // "a"
        [ 1, "4a0d129873403037c2cd9b9048203687f6233fb6738956e0349bd4320fec3e90" ],
        // "abc"
        [ 2, "508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982" ],
        // "\x55".repeat( 56 )
        [ 3, "6dbb0eea89d5f845e5d285a6425e10d3a4da558430375d61433632feaae3c0b6" ],
        // "\xaa".repeat( 112 )
        [ 4, "b19033b695fa40a62e2b17cd234c42a8b39059652dae9c7a6cb7e33e9357f837" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "08dd7c69cc4c93541d37da6a6d5f25f57f72c637ca00eb126137beb572899b50" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "4e33bcadc6b35829b6d120087e06349dfabb568155abea606bf99dc0a5f02d9f" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "5cd221fce46c8b83101f6e4dc1bc0f0d79d3f6d544fd78fdf9d7c4369aea4eb5" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 256, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2s256ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2bBASE
const BLAKE2bBASE = ( function() {

    const superClass = PADDING_BLAKE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE_MAX = 64;

    const IV0 = new UINT64( 0x6A09_E667, 0xF3BC_C908 ),
          IV1 = new UINT64( 0xBB67_AE85, 0x84CA_A73B ),
          IV2 = new UINT64( 0x3C6E_F372, 0xFE94_F82B ),
          IV3 = new UINT64( 0xA54F_F53A, 0x5F1D_36F1 ),
          IV4 = new UINT64( 0x510E_527F, 0xADE6_82D1 ),
          IV5 = new UINT64( 0x9B05_688C, 0x2B3E_6C1F ),
          IV6 = new UINT64( 0x1F83_D9AB, 0xFB41_BD6B ),
          IV7 = new UINT64( 0x5BE0_CD19, 0x137E_2179 );

    const IV = [ IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7 ];

    const S = [
        [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ],
        [ 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 ],
        [ 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4 ],
        [ 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8 ],
        [ 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13 ],
        [ 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9 ],
        [ 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11 ],
        [ 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10 ],
        [ 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5 ],
        [ 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0 ]
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( hashSizeBits, unrolled ) {

        // PADDING_BLAKE.call( this ); // no need calling empty constructor
        HASH.call( this, 128 );

        let className = "BLAKE2b" + hashSizeBits;

        if( unrolled ) {
            className += "-unrolled";

            const  H0 = UINT64.zero(),  H1 = UINT64.zero(),
                   H2 = UINT64.zero(),  H3 = UINT64.zero(),
                   H4 = UINT64.zero(),  H5 = UINT64.zero(),
                   H6 = UINT64.zero(),  H7 = UINT64.zero();

            const  V0 = UINT64.zero(),  V1 = UINT64.zero(),
                   V2 = UINT64.zero(),  V3 = UINT64.zero(),
                   V4 = UINT64.zero(),  V5 = UINT64.zero(),
                   V6 = UINT64.zero(),  V7 = UINT64.zero(),
                   V8 = UINT64.zero(),  V9 = UINT64.zero(),
                  V10 = UINT64.zero(), V11 = UINT64.zero(),
                  V12 = UINT64.zero(), V13 = UINT64.zero(),
                  V14 = UINT64.zero(), V15 = UINT64.zero();

            const  X0 = UINT64.zero(),  X1 = UINT64.zero(),
                   X2 = UINT64.zero(),  X3 = UINT64.zero(),
                   X4 = UINT64.zero(),  X5 = UINT64.zero(),
                   X6 = UINT64.zero(),  X7 = UINT64.zero(),
                   X8 = UINT64.zero(),  X9 = UINT64.zero(),
                  X10 = UINT64.zero(), X11 = UINT64.zero(),
                  X12 = UINT64.zero(), X13 = UINT64.zero(),
                  X14 = UINT64.zero(), X15 = UINT64.zero();

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                 X0.init2( view.getUint32( ofs +   4, LITTLE_ENDIAN ),
                           view.getUint32( ofs      , LITTLE_ENDIAN ) );
                 X1.init2( view.getUint32( ofs +  12, LITTLE_ENDIAN ),
                           view.getUint32( ofs +   8, LITTLE_ENDIAN ) );
                 X2.init2( view.getUint32( ofs +  20, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  16, LITTLE_ENDIAN ) );
                 X3.init2( view.getUint32( ofs +  28, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  24, LITTLE_ENDIAN ) );
                 X4.init2( view.getUint32( ofs +  36, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  32, LITTLE_ENDIAN ) );
                 X5.init2( view.getUint32( ofs +  44, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  40, LITTLE_ENDIAN ) );
                 X6.init2( view.getUint32( ofs +  52, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  48, LITTLE_ENDIAN ) );
                 X7.init2( view.getUint32( ofs +  60, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  56, LITTLE_ENDIAN ) );
                 X8.init2( view.getUint32( ofs +  68, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  64, LITTLE_ENDIAN ) );
                 X9.init2( view.getUint32( ofs +  76, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  72, LITTLE_ENDIAN ) );
                X10.init2( view.getUint32( ofs +  84, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  80, LITTLE_ENDIAN ) );
                X11.init2( view.getUint32( ofs +  92, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  88, LITTLE_ENDIAN ) );
                X12.init2( view.getUint32( ofs + 100, LITTLE_ENDIAN ),
                           view.getUint32( ofs +  96, LITTLE_ENDIAN ) );
                X13.init2( view.getUint32( ofs + 108, LITTLE_ENDIAN ),
                           view.getUint32( ofs + 104, LITTLE_ENDIAN ) );
                X14.init2( view.getUint32( ofs + 116, LITTLE_ENDIAN ),
                           view.getUint32( ofs + 112, LITTLE_ENDIAN ) );
                X15.init2( view.getUint32( ofs + 124, LITTLE_ENDIAN ),
                           view.getUint32( ofs + 120, LITTLE_ENDIAN ) );

                 V0.init(  H0 );  V1.init(  H1 );
                 V2.init(  H2 );  V3.init(  H3 );
                 V4.init(  H4 );  V5.init(  H5 );
                 V6.init(  H6 );  V7.init(  H7 );
                 V8.init( IV0 );  V9.init( IV1 );
                V10.init( IV2 ); V11.init( IV3 );
                V12.init( IV4 ); V13.init( IV5 );
                V14.init( IV6 ); V15.init( IV7 );

                const T = this.byteLength + this.dataBlockSize;
                // assuming Number.isSafeInteger( T ) to be true!
                V12.xor( new UINT64( T / 2**32, T ) );
//              V13.xor( new UINT64( T / 2**96, T / 2**64 ) );
                if( this.isLastBlock )
                    V14.invert();

                V0.add( V4 ).add(  X0 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X1 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X2 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X3 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X4 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X5 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X6 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X7 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X8 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X9 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add( X10 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add( X11 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add( X12 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add( X13 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add( X14 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add( X15 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X14 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add( X10 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X4 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X8 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X9 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add( X15 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add( X13 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X6 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X1 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add( X12 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X0 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X2 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add( X11 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X7 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X5 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X3 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X11 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X8 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add( X12 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X0 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X5 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X2 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add( X15 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add( X13 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add( X10 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add( X14 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X3 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X6 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X7 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X1 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X9 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X4 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add(  X7 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X9 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X3 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X1 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add( X13 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add( X12 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add( X11 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add( X14 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X2 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X6 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X5 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add( X10 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X4 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X0 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add( X15 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X8 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add(  X9 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X0 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X5 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X7 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X2 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X4 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add( X10 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add( X15 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add( X14 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X1 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add( X11 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add( X12 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X6 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X8 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X3 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add( X13 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add(  X2 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add( X12 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X6 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add( X10 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X0 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add( X11 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X8 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X3 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X4 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add( X13 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X7 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X5 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add( X15 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add( X14 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X1 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X9 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X12 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X5 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X1 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add( X15 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add( X14 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add( X13 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X4 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add( X10 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X0 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X7 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X6 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X3 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X9 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X2 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X8 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add( X11 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X13 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add( X11 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X7 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add( X14 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add( X12 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X1 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X3 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X9 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X5 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X0 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add( X15 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X4 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X8 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X6 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X2 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add( X10 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add(  X6 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add( X15 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add( X14 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X9 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add( X11 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X3 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X0 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X8 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add( X12 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X2 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add( X13 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X7 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X1 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X4 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add( X10 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X5 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X10 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X2 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X8 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X4 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X7 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X6 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X1 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X5 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add( X15 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add( X11 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X9 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add( X14 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add(  X3 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add( X12 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add( X13 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X0 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add(  X0 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add(  X1 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X2 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X3 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X4 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add(  X5 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add(  X6 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X7 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X8 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add(  X9 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add( X10 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add( X11 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add( X12 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add( X13 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add( X14 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add( X15 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );
                V0.add( V4 ).add( X14 ); V12.xor( V0 ).ror( 32 );  V8.add( V12 ); V4.xor(  V8 ).ror( 24 );
                V0.add( V4 ).add( X10 ); V12.xor( V0 ).ror( 16 );  V8.add( V12 ); V4.xor(  V8 ).ror( 63 );
                V1.add( V5 ).add(  X4 ); V13.xor( V1 ).ror( 32 );  V9.add( V13 ); V5.xor(  V9 ).ror( 24 );
                V1.add( V5 ).add(  X8 ); V13.xor( V1 ).ror( 16 );  V9.add( V13 ); V5.xor(  V9 ).ror( 63 );
                V2.add( V6 ).add(  X9 ); V14.xor( V2 ).ror( 32 ); V10.add( V14 ); V6.xor( V10 ).ror( 24 );
                V2.add( V6 ).add( X15 ); V14.xor( V2 ).ror( 16 ); V10.add( V14 ); V6.xor( V10 ).ror( 63 );
                V3.add( V7 ).add( X13 ); V15.xor( V3 ).ror( 32 ); V11.add( V15 ); V7.xor( V11 ).ror( 24 );
                V3.add( V7 ).add(  X6 ); V15.xor( V3 ).ror( 16 ); V11.add( V15 ); V7.xor( V11 ).ror( 63 );
                V0.add( V5 ).add(  X1 ); V15.xor( V0 ).ror( 32 ); V10.add( V15 ); V5.xor( V10 ).ror( 24 );
                V0.add( V5 ).add( X12 ); V15.xor( V0 ).ror( 16 ); V10.add( V15 ); V5.xor( V10 ).ror( 63 );
                V1.add( V6 ).add(  X0 ); V12.xor( V1 ).ror( 32 ); V11.add( V12 ); V6.xor( V11 ).ror( 24 );
                V1.add( V6 ).add(  X2 ); V12.xor( V1 ).ror( 16 ); V11.add( V12 ); V6.xor( V11 ).ror( 63 );
                V2.add( V7 ).add( X11 ); V13.xor( V2 ).ror( 32 );  V8.add( V13 ); V7.xor(  V8 ).ror( 24 );
                V2.add( V7 ).add(  X7 ); V13.xor( V2 ).ror( 16 );  V8.add( V13 ); V7.xor(  V8 ).ror( 63 );
                V3.add( V4 ).add(  X5 ); V14.xor( V3 ).ror( 32 );  V9.add( V14 ); V4.xor(  V9 ).ror( 24 );
                V3.add( V4 ).add(  X3 ); V14.xor( V3 ).ror( 16 );  V9.add( V14 ); V4.xor(  V9 ).ror( 63 );

                H0.xor( V0 ).xor(  V8 );
                H1.xor( V1 ).xor(  V9 );
                H2.xor( V2 ).xor( V10 );
                H3.xor( V3 ).xor( V11 );
                H4.xor( V4 ).xor( V12 );
                H5.xor( V5 ).xor( V13 );
                H6.xor( V6 ).xor( V14 );
                H7.xor( V7 ).xor( V15 );
            }

            this.finalize = function() {
                const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
                [ H0, H1, H2, H3, H4, H5, H6, H7 ].forEach( ( h, i ) => {
                    view.setUint32( 8 * i    , h.lo, LITTLE_ENDIAN );
                    view.setUint32( 8 * i + 4, h.hi, LITTLE_ENDIAN );
                } );
                this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
            }

            this.init = function() {
                superClass.prototype.init.call( this );

                H0.init( IV0 )
                    .xor( new UINT64( 0, 0x0101_0000 ) )
                    .xor( new UINT64( 0, hashSizeBits >> 3 ) );
                H1.init( IV1 );
                H2.init( IV2 );
                H3.init( IV3 );
                H4.init( IV4 );
                H5.init( IV5 );
                H6.init( IV6 );
                H7.init( IV7 );
            };
        }
        else {
            className += "-mini";

            // pre-allocating arrays, their instances MUST NOT change
            const H = ( new Array(  8 ) ).fill( 0 );
            H.forEach( ( e, i ) => H[i] = UINT64.zero() );
            const V = ( new Array( 16 ) ).fill( 0 );
            V.forEach( ( e, i ) => V[i] = UINT64.zero() );
            const X = ( new Array( 16 ) ).fill( 0 );
            X.forEach( ( e, i ) => X[i] = UINT64.zero() );

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                function G( a, b, c, d, x, y ) {
                    V[a].add( V[b] ).add( x );
                    V[d].xor( V[a] ).ror( 32 );
                    V[c].add( V[d] );
                    V[b].xor( V[c] ).ror( 24 );
                    V[a].add( V[b] ).add( y );
                    V[d].xor( V[a] ).ror( 16 );
                    V[c].add( V[d] );
                    V[b].xor( V[c] ).ror( 63 );
                }

                X.forEach( ( x, i ) => {
                    x.lo = view.getUint32( ofs + 8 * i    , LITTLE_ENDIAN );
                    x.hi = view.getUint32( ofs + 8 * i + 4, LITTLE_ENDIAN );
                } );

                H.forEach( ( h, i ) => V[i].init( h ) );
                IV.forEach( ( iv, i ) => V[i + 8].init( iv ) );

                const T = this.byteLength + this.dataBlockSize;
                // assuming Number.isSafeInteger( T ) to be true!
                V[12].xor( new UINT64( T / 2**32, T ) );
//              V[13].xor( new UINT64( T / 2**96, T / 2**64 ) );
                if( this.isLastBlock )
                    V[14].invert();

                for( let i = 0; i < 12; i++ ) {
                    const SI = S[i % 10];
                    G( 0, 4, 8, 12, X[SI[0]], X[SI[1]] );
                    G( 1, 5, 9, 13, X[SI[2]], X[SI[3]] );
                    G( 2, 6, 10, 14, X[SI[4]], X[SI[5]] );
                    G( 3, 7, 11, 15, X[SI[6]], X[SI[7]] );
                    G( 0, 5, 10, 15, X[SI[8]], X[SI[9]] );
                    G( 1, 6, 11, 12, X[SI[10]], X[SI[11]] );
                    G( 2, 7, 8, 13, X[SI[12]], X[SI[13]] );
                    G( 3, 4, 9, 14, X[SI[14]], X[SI[15]] );
                }

                H.forEach( ( h, i ) => h.xor( V[i] ).xor( V[i + 8] ) );
            }

            this.finalize = function() {
                const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
                H.forEach( ( h, i ) => {
                    view.setUint32( 8 * i    , h.lo, LITTLE_ENDIAN );
                    view.setUint32( 8 * i + 4, h.hi, LITTLE_ENDIAN );
                } );
                this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
            }

            this.init = function() {
                superClass.prototype.init.call( this );

                IV.forEach( ( iv, i ) => H[i].init( iv ) );
                H[0].xor( new UINT64( 0, 0x0101_0000 ) )
                    .xor( new UINT64( 0, hashSizeBits >> 3 ) );
            };
        }

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2b160
const BLAKE2b160 = ( function() {

    const superClass = BLAKE2bBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2b160ref = new Map( [
        // ""
        [ 0, "3345524abf6bbe1809449224b5972c41790b6cf2" ],
        // "a"
        [ 1, "948caa2db61bc4cdb4faf7740cd491f195043914" ],
        // "abc"
        [ 2, "384264f676f39536840523f284921cdc68b6846b" ],
        // "\x55".repeat( 56 )
        [ 3, "8900cfcf995c425f95388466d3916fe1aaed1ca7" ],
        // "\xaa".repeat( 112 )
        [ 4, "7b89d0bc98a007a9bf4782b62c38b748aa5aa621" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "551fbb12e8e8803060f7c15254c92f25694eb295" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "a0e78c06623e12029b139170a1b3f59ef470f31f" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "621e9e9e1439d9f4661da9c871d6b077d0ca2715" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 160, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2b160ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2b256
const BLAKE2b256 = ( function() {

    const superClass = BLAKE2bBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2b256ref = new Map( [
        // ""
        [ 0, "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8" ],
        // "a"
        [ 1, "8928aae63c84d87ea098564d1e03ad813f107add474e56aedd286349c0c03ea4" ],
        // "abc"
        [ 2, "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319" ],
        // "\x55".repeat( 56 )
        [ 3, "d5a2770cccf153cf51faa70e786cbc47dfcfc2a713a8577bea694f495a11404f" ],
        // "\xaa".repeat( 112 )
        [ 4, "4e0cb4386b1db432868df05be15e38fe8553e67f24a3b3d6e7c0d4c5adf379b4" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "dfdcf5e61e21fe8f3ab6ff8c0eb3c82d2ef983d38fb7d7ac1f346417e7ed714a" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "829e830feb48a9a5ab528dc0dfd9d5c2407806684bc2fda4563883fffde15fae" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "75847009fa76c6177f384a8bbcb6ee923c6060ad8ec77d5181f09f4ea72861b0" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 256, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2b256ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2b384
const BLAKE2b384 = ( function() {

    const superClass = BLAKE2bBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2b384ref = new Map( [
        // ""
        [ 0, "b32811423377f52d7862286ee1a72ee540524380fda1724a6f25d7978c6fd3244a6caf0498812673c5e05ef583825100" ],
        // "a"
        [ 1, "7d40de16ff771d4595bf70cbda0c4ea0a066a6046fa73d34471cd4d93d827d7c94c29399c50de86983af1ec61d5dcef0" ],
        // "abc"
        [ 2, "6f56a82c8e7ef526dfe182eb5212f7db9df1317e57815dbda46083fc30f54ee6c66ba83be64b302d7cba6ce15bb556f4" ],
        // "\x55".repeat( 56 )
        [ 3, "24cdddbf5f7193492eca0c1810c7f0d62b3a4a9642a45f7322c38c12927464312fa11f723d4e0fa5314604b58d59c131" ],
        // "\xaa".repeat( 112 )
        [ 4, "a0c8823c798ef5b4d4b571d7fba1402c586a11f7c6b5e7099d1de89dc06cf1962b9a5a8c5725febaff044f768c7ef494" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "a63a20bbb8d88c11fa64354a9c00206fa42024dc48658945cd9c304e3d25885bf94b5d77eb7c7e9391b1e6ff6f7b3b89" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "44018b31dd096003e3fd962de729b4784102190fc5acdfa2cbf3058120c062460a4ca01cf808b1eceab3893e69c4a3b5" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "19dd6b2bbdb195885f82cec06111ac5daa1be348c2383cfbf5921acd7e31b81ba5d9749d50a58ecc734500bcb6fb53c9" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 384, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2b384ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class BLAKE2b512
const BLAKE2b512 = ( function() {

    const superClass = BLAKE2bBASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const blake2b512ref = new Map( [
        // ""
        [ 0, "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce" ],
        // "a"
        [ 1, "333fcb4ee1aa7c115355ec66ceac917c8bfd815bf7587d325aec1864edd24e34d5abe2c6b1b5ee3face62fed78dbef802f2a85cb91d455a8f5249d330853cb3c" ],
        // "abc"
        [ 2, "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923" ],
        // "\x55".repeat( 56 )
        [ 3, "03a992301ef272ecce5adfce8c0e505bcea3219c938fb35b8a94f4d8e93f1798d6e035c2423766509ec2e87da2f2002d79f0816d0d6280daec2edfce18fd0904" ],
        // "\xaa".repeat( 112 )
        [ 4, "3e5107fee1eabc0005ef2a61747907377f8bfae5eb562bfc6a1f4f2143ac2b97277c755c3564a8fefe63303ca8cc51f6d1146a3c117e77df205c2544ae453330" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "eca9efb4b8451b809776d6d1ffb5511c14783e71022e70f0f91b7e4e30499248e42809de98c601ce54eed715283c95968a0d5c3ffe0f6f8a839eaa638b46aeb3" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "a0c8530a4f0f5332b3d4ab464f08e86913bda2d74dcf06b500d4b183e8585c180ecc61c933acbc3abedf57d2b90d99f7aee57adab7f75b02f87aafb669ce6e69" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "8eba8bc1c11f06f7fe1675731ca2882c624ba189a02d5cd20b172d34dde0ea4287495a0fb3a0417a6a80e41bbaa2fa71e9f356d5464148f297f7cb2c236b2ce9" ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, 512, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, blake2b512ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA512BASE
const SHA512BASE = ( function() {

    const superClass = PADDING_BE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const HASH_SIZE_MAX = 64;

    const  K0 = new UINT64( 0x428A_2F98, 0xD728_AE22 ),  K1 = new UINT64( 0x7137_4491, 0x23EF_65CD ),
           K2 = new UINT64( 0xB5C0_FBCF, 0xEC4D_3B2F ),  K3 = new UINT64( 0xE9B5_DBA5, 0x8189_DBBC ),
           K4 = new UINT64( 0x3956_C25B, 0xF348_B538 ),  K5 = new UINT64( 0x59F1_11F1, 0xB605_D019 ),
           K6 = new UINT64( 0x923F_82A4, 0xAF19_4F9B ),  K7 = new UINT64( 0xAB1C_5ED5, 0xDA6D_8118 ),
           K8 = new UINT64( 0xD807_AA98, 0xA303_0242 ),  K9 = new UINT64( 0x1283_5B01, 0x4570_6FBE ),
          K10 = new UINT64( 0x2431_85BE, 0x4EE4_B28C ), K11 = new UINT64( 0x550C_7DC3, 0xD5FF_B4E2 ),
          K12 = new UINT64( 0x72BE_5D74, 0xF27B_896F ), K13 = new UINT64( 0x80DE_B1FE, 0x3B16_96B1 ),
          K14 = new UINT64( 0x9BDC_06A7, 0x25C7_1235 ), K15 = new UINT64( 0xC19B_F174, 0xCF69_2694 ),
          K16 = new UINT64( 0xE49B_69C1, 0x9EF1_4AD2 ), K17 = new UINT64( 0xEFBE_4786, 0x384F_25E3 ),
          K18 = new UINT64( 0x0FC1_9DC6, 0x8B8C_D5B5 ), K19 = new UINT64( 0x240C_A1CC, 0x77AC_9C65 ),
          K20 = new UINT64( 0x2DE9_2C6F, 0x592B_0275 ), K21 = new UINT64( 0x4A74_84AA, 0x6EA6_E483 ),
          K22 = new UINT64( 0x5CB0_A9DC, 0xBD41_FBD4 ), K23 = new UINT64( 0x76F9_88DA, 0x8311_53B5 ),
          K24 = new UINT64( 0x983E_5152, 0xEE66_DFAB ), K25 = new UINT64( 0xA831_C66D, 0x2DB4_3210 ),
          K26 = new UINT64( 0xB003_27C8, 0x98FB_213F ), K27 = new UINT64( 0xBF59_7FC7, 0xBEEF_0EE4 ),
          K28 = new UINT64( 0xC6E0_0BF3, 0x3DA8_8FC2 ), K29 = new UINT64( 0xD5A7_9147, 0x930A_A725 ),
          K30 = new UINT64( 0x06CA_6351, 0xE003_826F ), K31 = new UINT64( 0x1429_2967, 0x0A0E_6E70 ),
          K32 = new UINT64( 0x27B7_0A85, 0x46D2_2FFC ), K33 = new UINT64( 0x2E1B_2138, 0x5C26_C926 ),
          K34 = new UINT64( 0x4D2C_6DFC, 0x5AC4_2AED ), K35 = new UINT64( 0x5338_0D13, 0x9D95_B3DF ),
          K36 = new UINT64( 0x650A_7354, 0x8BAF_63DE ), K37 = new UINT64( 0x766A_0ABB, 0x3C77_B2A8 ),
          K38 = new UINT64( 0x81C2_C92E, 0x47ED_AEE6 ), K39 = new UINT64( 0x9272_2C85, 0x1482_353B ),
          K40 = new UINT64( 0xA2BF_E8A1, 0x4CF1_0364 ), K41 = new UINT64( 0xA81A_664B, 0xBC42_3001 ),
          K42 = new UINT64( 0xC24B_8B70, 0xD0F8_9791 ), K43 = new UINT64( 0xC76C_51A3, 0x0654_BE30 ),
          K44 = new UINT64( 0xD192_E819, 0xD6EF_5218 ), K45 = new UINT64( 0xD699_0624, 0x5565_A910 ),
          K46 = new UINT64( 0xF40E_3585, 0x5771_202A ), K47 = new UINT64( 0x106A_A070, 0x32BB_D1B8 ),
          K48 = new UINT64( 0x19A4_C116, 0xB8D2_D0C8 ), K49 = new UINT64( 0x1E37_6C08, 0x5141_AB53 ),
          K50 = new UINT64( 0x2748_774C, 0xDF8E_EB99 ), K51 = new UINT64( 0x34B0_BCB5, 0xE19B_48A8 ),
          K52 = new UINT64( 0x391C_0CB3, 0xC5C9_5A63 ), K53 = new UINT64( 0x4ED8_AA4A, 0xE341_8ACB ),
          K54 = new UINT64( 0x5B9C_CA4F, 0x7763_E373 ), K55 = new UINT64( 0x682E_6FF3, 0xD6B2_B8A3 ),
          K56 = new UINT64( 0x748F_82EE, 0x5DEF_B2FC ), K57 = new UINT64( 0x78A5_636F, 0x4317_2F60 ),
          K58 = new UINT64( 0x84C8_7814, 0xA1F0_AB72 ), K59 = new UINT64( 0x8CC7_0208, 0x1A64_39EC ),
          K60 = new UINT64( 0x90BE_FFFA, 0x2363_1E28 ), K61 = new UINT64( 0xA450_6CEB, 0xDE82_BDE9 ),
          K62 = new UINT64( 0xBEF9_A3F7, 0xB2C6_7915 ), K63 = new UINT64( 0xC671_78F2, 0xE372_532B ),
          K64 = new UINT64( 0xCA27_3ECE, 0xEA26_619C ), K65 = new UINT64( 0xD186_B8C7, 0x21C0_C207 ),
          K66 = new UINT64( 0xEADA_7DD6, 0xCDE0_EB1E ), K67 = new UINT64( 0xF57D_4F7F, 0xEE6E_D178 ),
          K68 = new UINT64( 0x06F0_67AA, 0x7217_6FBA ), K69 = new UINT64( 0x0A63_7DC5, 0xA2C8_98A6 ),
          K70 = new UINT64( 0x113F_9804, 0xBEF9_0DAE ), K71 = new UINT64( 0x1B71_0B35, 0x131C_471B ),
          K72 = new UINT64( 0x28DB_77F5, 0x2304_7D84 ), K73 = new UINT64( 0x32CA_AB7B, 0x40C7_2493 ),
          K74 = new UINT64( 0x3C9E_BE0A, 0x15C9_BEBC ), K75 = new UINT64( 0x431D_67C4, 0x9C10_0D4C ),
          K76 = new UINT64( 0x4CC5_D4BE, 0xCB3E_42B6 ), K77 = new UINT64( 0x597F_299C, 0xFC65_7E2A ),
          K78 = new UINT64( 0x5FCB_6FAB, 0x3AD6_FAEC ), K79 = new UINT64( 0x6C44_198C, 0x4A47_5817 );

    const K = [
         K0,  K1,  K2,  K3,  K4,  K5,  K6,  K7,  K8,  K9,
        K10, K11, K12, K13, K14, K15, K16, K17, K18, K19,
        K20, K21, K22, K23, K24, K25, K26, K27, K28, K29,
        K30, K31, K32, K33, K34, K35, K36, K37, K38, K39,
        K40, K41, K42, K43, K44, K45, K46, K47, K48, K49,
        K50, K51, K52, K53, K54, K55, K56, K57, K58, K59,
        K60, K61, K62, K63, K64, K65, K66, K67, K68, K69,
        K70, K71, K72, K73, K74, K75, K76, K77, K78, K79
    ];

    // BEWARE side effects!!!
    const tmp = UINT64.zero(), tmp2 = UINT64.zero(),
          tmp3 = UINT64.zero(), result = UINT64.zero();

    function s0( a ) {
        // ror( a, 1 ) ^ ror( a, 8 ) ^ ( a >>> 7 );
        return result.init( a ).ror( 1 ).xor( tmp.init( a ).ror( 8 ) )
            .xor( tmp.init( a ).shr( 7 ) );
    }

    function s1( a ) {
        // ror( a, 19 ) ^ ror( a, 61 ) ^ ( a >>> 6 );
        return result.init( a ).ror( 19 ).xor( tmp.init( a ).ror( 61 ) )
            .xor( tmp.init( a ).shr( 6 ) );
    }

    function f0( a, b, c ) {
        // ( ( a & b ) | ( c & ( a | b ) ) )
        //     + ( ror( a, 28 ) ^ ror( a, 34 ) ^ ror( a, 39 ) );
        return result.init( a ).and( b ).or( tmp2.init( c ).and( tmp.init( a ).or( b ) ) )
            .add( tmp2.init( a ).ror( 28 ).xor( tmp.init( a )
                .ror( 34 ) ).xor( tmp.init( a ).ror( 39 ) ) );
    }

    function f1( a, b, c ) {
        // ( c ^ ( a & ( b ^ c ) ) )
        //     + ( ror( a, 14 ) ^ ror( a, 18 ) ^ ror( a, 41 ) );
        return result.init( c ).xor( tmp2.init( a ).and( tmp.init( b ).xor( c ) ) )
            .add( tmp2.init( a ).ror( 14 ).xor( tmp.init( a )
                .ror( 18 ) ).xor( tmp.init( a ).ror( 41 ) ) );
    }

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( IV, hashSizeBits, unrolled ) {

        // PADDING_BE.call( this ); // no need calling empty constructor
        HASH.call( this, 128 );

        let className = "SHA512";
        if( hashSizeBits != 512 )
            className += "/" + hashSizeBits;

        const H0 = UINT64.zero(), H1 = UINT64.zero(),
              H2 = UINT64.zero(), H3 = UINT64.zero(),
              H4 = UINT64.zero(), H5 = UINT64.zero(),
              H6 = UINT64.zero(), H7 = UINT64.zero();

        let A = UINT64.zero(), B = UINT64.zero(),
            C = UINT64.zero(), D = UINT64.zero(),
            E = UINT64.zero(), F = UINT64.zero(),
            G = UINT64.zero(), H = UINT64.zero();

        if( unrolled ) {
            className += "-unrolled";

            const  X0 = UINT64.zero(),  X1 = UINT64.zero(),
                   X2 = UINT64.zero(),  X3 = UINT64.zero(),
                   X4 = UINT64.zero(),  X5 = UINT64.zero(),
                   X6 = UINT64.zero(),  X7 = UINT64.zero(),
                   X8 = UINT64.zero(),  X9 = UINT64.zero(),
                  X10 = UINT64.zero(), X11 = UINT64.zero(),
                  X12 = UINT64.zero(), X13 = UINT64.zero(),
                  X14 = UINT64.zero(), X15 = UINT64.zero();

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                 X0.init2( view.getUint32( ofs      , BIG_ENDIAN ),
                           view.getUint32( ofs +   4, BIG_ENDIAN ) );
                 X1.init2( view.getUint32( ofs +   8, BIG_ENDIAN ),
                           view.getUint32( ofs +  12, BIG_ENDIAN ) );
                 X2.init2( view.getUint32( ofs +  16, BIG_ENDIAN ),
                           view.getUint32( ofs +  20, BIG_ENDIAN ) );
                 X3.init2( view.getUint32( ofs +  24, BIG_ENDIAN ),
                           view.getUint32( ofs +  28, BIG_ENDIAN ) );
                 X4.init2( view.getUint32( ofs +  32, BIG_ENDIAN ),
                           view.getUint32( ofs +  36, BIG_ENDIAN ) );
                 X5.init2( view.getUint32( ofs +  40, BIG_ENDIAN ),
                           view.getUint32( ofs +  44, BIG_ENDIAN ) );
                 X6.init2( view.getUint32( ofs +  48, BIG_ENDIAN ),
                           view.getUint32( ofs +  52, BIG_ENDIAN ) );
                 X7.init2( view.getUint32( ofs +  56, BIG_ENDIAN ),
                           view.getUint32( ofs +  60, BIG_ENDIAN ) );
                 X8.init2( view.getUint32( ofs +  64, BIG_ENDIAN ),
                           view.getUint32( ofs +  68, BIG_ENDIAN ) );
                 X9.init2( view.getUint32( ofs +  72, BIG_ENDIAN ),
                           view.getUint32( ofs +  76, BIG_ENDIAN ) );
                X10.init2( view.getUint32( ofs +  80, BIG_ENDIAN ),
                           view.getUint32( ofs +  84, BIG_ENDIAN ) );
                X11.init2( view.getUint32( ofs +  88, BIG_ENDIAN ),
                           view.getUint32( ofs +  92, BIG_ENDIAN ) );
                X12.init2( view.getUint32( ofs +  96, BIG_ENDIAN ),
                           view.getUint32( ofs + 100, BIG_ENDIAN ) );
                X13.init2( view.getUint32( ofs + 104, BIG_ENDIAN ),
                           view.getUint32( ofs + 108, BIG_ENDIAN ) );
                X14.init2( view.getUint32( ofs + 112, BIG_ENDIAN ),
                           view.getUint32( ofs + 116, BIG_ENDIAN ) );
                X15.init2( view.getUint32( ofs + 120, BIG_ENDIAN ),
                           view.getUint32( ofs + 124, BIG_ENDIAN ) );

                A.init( H0 ); B.init( H1 );
                C.init( H2 ); D.init( H3 );
                E.init( H4 ); F.init( H5 );
                G.init( H6 ); H.init( H7 );

                H.add( f1( E, F, G ) ).add(  K0 ).add(  X0 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add(  K1 ).add(  X1 ); C.add( G ); G.add( f0( H, A, B ) );
                F.add( f1( C, D, E ) ).add(  K2 ).add(  X2 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add(  K3 ).add(  X3 ); A.add( E ); E.add( f0( F, G, H ) );
                D.add( f1( A, B, C ) ).add(  K4 ).add(  X4 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add(  K5 ).add(  X5 ); G.add( C ); C.add( f0( D, E, F ) );
                B.add( f1( G, H, A ) ).add(  K6 ).add(  X6 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add(  K7 ).add(  X7 ); E.add( A ); A.add( f0( B, C, D ) );
                H.add( f1( E, F, G ) ).add(  K8 ).add(  X8 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add(  K9 ).add(  X9 ); C.add( G ); G.add( f0( H, A, B ) );
                F.add( f1( C, D, E ) ).add( K10 ).add( X10 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K11 ).add( X11 ); A.add( E ); E.add( f0( F, G, H ) );
                D.add( f1( A, B, C ) ).add( K12 ).add( X12 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K13 ).add( X13 ); G.add( C ); C.add( f0( D, E, F ) );
                B.add( f1( G, H, A ) ).add( K14 ).add( X14 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K15 ).add( X15 ); E.add( A ); A.add( f0( B, C, D ) );
                X0.add( s0(  X1 ) ).add(  X9 ).add( s1( X14 ) );
                X1.add( s0(  X2 ) ).add( X10 ).add( s1( X15 ) );
                H.add( f1( E, F, G ) ).add( K16 ).add(  X0 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K17 ).add(  X1 ); C.add( G ); G.add( f0( H, A, B ) );
                X2.add( s0(  X3 ) ).add( X11 ).add( s1(  X0 ) );
                X3.add( s0(  X4 ) ).add( X12 ).add( s1(  X1 ) );
                F.add( f1( C, D, E ) ).add( K18 ).add(  X2 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K19 ).add(  X3 ); A.add( E ); E.add( f0( F, G, H ) );
                X4.add( s0(  X5 ) ).add( X13 ).add( s1(  X2 ) );
                X5.add( s0(  X6 ) ).add( X14 ).add( s1(  X3 ) );
                D.add( f1( A, B, C ) ).add( K20 ).add(  X4 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K21 ).add(  X5 ); G.add( C ); C.add( f0( D, E, F ) );
                X6.add( s0(  X7 ) ).add( X15 ).add( s1(  X4 ) );
                X7.add( s0(  X8 ) ).add(  X0 ).add( s1(  X5 ) );
                B.add( f1( G, H, A ) ).add( K22 ).add(  X6 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K23 ).add(  X7 ); E.add( A ); A.add( f0( B, C, D ) );
                X8.add( s0(  X9 ) ).add(  X1 ).add( s1(  X6 ) );
                X9.add( s0( X10 ) ).add(  X2 ).add( s1(  X7 ) );
                H.add( f1( E, F, G ) ).add( K24 ).add(  X8 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K25 ).add(  X9 ); C.add( G ); G.add( f0( H, A, B ) );
                X10.add( s0( X11 ) ).add(  X3 ).add( s1(  X8 ) );
                X11.add( s0( X12 ) ).add(  X4 ).add( s1(  X9 ) );
                F.add( f1( C, D, E ) ).add( K26 ).add( X10 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K27 ).add( X11 ); A.add( E ); E.add( f0( F, G, H ) );
                X12.add( s0( X13 ) ).add(  X5 ).add( s1( X10 ) );
                X13.add( s0( X14 ) ).add(  X6 ).add( s1( X11 ) );
                D.add( f1( A, B, C ) ).add( K28 ).add( X12 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K29 ).add( X13 ); G.add( C ); C.add( f0( D, E, F ) );
                X14.add( s0( X15 ) ).add(  X7 ).add( s1( X12 ) );
                X15.add( s0(  X0 ) ).add(  X8 ).add( s1( X13 ) );
                B.add( f1( G, H, A ) ).add( K30 ).add( X14 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K31 ).add( X15 ); E.add( A ); A.add( f0( B, C, D ) );
                X0.add( s0(  X1 ) ).add(  X9 ).add( s1( X14 ) );
                X1.add( s0(  X2 ) ).add( X10 ).add( s1( X15 ) );
                H.add( f1( E, F, G ) ).add( K32 ).add(  X0 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K33 ).add(  X1 ); C.add( G ); G.add( f0( H, A, B ) );
                X2.add( s0(  X3 ) ).add( X11 ).add( s1(  X0 ) );
                X3.add( s0(  X4 ) ).add( X12 ).add( s1(  X1 ) );
                F.add( f1( C, D, E ) ).add( K34 ).add(  X2 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K35 ).add(  X3 ); A.add( E ); E.add( f0( F, G, H ) );
                X4.add( s0(  X5 ) ).add( X13 ).add( s1(  X2 ) );
                X5.add( s0(  X6 ) ).add( X14 ).add( s1(  X3 ) );
                D.add( f1( A, B, C ) ).add( K36 ).add(  X4 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K37 ).add(  X5 ); G.add( C ); C.add( f0( D, E, F ) );
                X6.add( s0(  X7 ) ).add( X15 ).add( s1(  X4 ) );
                X7.add( s0(  X8 ) ).add(  X0 ).add( s1(  X5 ) );
                B.add( f1( G, H, A ) ).add( K38 ).add(  X6 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K39 ).add(  X7 ); E.add( A ); A.add( f0( B, C, D ) );
                X8.add( s0(  X9 ) ).add(  X1 ).add( s1(  X6 ) );
                X9.add( s0( X10 ) ).add(  X2 ).add( s1(  X7 ) );
                H.add( f1( E, F, G ) ).add( K40 ).add(  X8 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K41 ).add(  X9 ); C.add( G ); G.add( f0( H, A, B ) );
                X10.add( s0( X11 ) ).add(  X3 ).add( s1(  X8 ) );
                X11.add( s0( X12 ) ).add(  X4 ).add( s1(  X9 ) );
                F.add( f1( C, D, E ) ).add( K42 ).add( X10 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K43 ).add( X11 ); A.add( E ); E.add( f0( F, G, H ) );
                X12.add( s0( X13 ) ).add(  X5 ).add( s1( X10 ) );
                X13.add( s0( X14 ) ).add(  X6 ).add( s1( X11 ) );
                D.add( f1( A, B, C ) ).add( K44 ).add( X12 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K45 ).add( X13 ); G.add( C ); C.add( f0( D, E, F ) );
                X14.add( s0( X15 ) ).add(  X7 ).add( s1( X12 ) );
                X15.add( s0(  X0 ) ).add(  X8 ).add( s1( X13 ) );
                B.add( f1( G, H, A ) ).add( K46 ).add( X14 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K47 ).add( X15 ); E.add( A ); A.add( f0( B, C, D ) );
                X0.add( s0(  X1 ) ).add(  X9 ).add( s1( X14 ) );
                X1.add( s0(  X2 ) ).add( X10 ).add( s1( X15 ) );
                H.add( f1( E, F, G ) ).add( K48 ).add(  X0 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K49 ).add(  X1 ); C.add( G ); G.add( f0( H, A, B ) );
                X2.add( s0(  X3 ) ).add( X11 ).add( s1(  X0 ) );
                X3.add( s0(  X4 ) ).add( X12 ).add( s1(  X1 ) );
                F.add( f1( C, D, E ) ).add( K50 ).add(  X2 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K51 ).add(  X3 ); A.add( E ); E.add( f0( F, G, H ) );
                X4.add( s0(  X5 ) ).add( X13 ).add( s1(  X2 ) );
                X5.add( s0(  X6 ) ).add( X14 ).add( s1(  X3 ) );
                D.add( f1( A, B, C ) ).add( K52 ).add(  X4 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K53 ).add(  X5 ); G.add( C ); C.add( f0( D, E, F ) );
                X6.add( s0(  X7 ) ).add( X15 ).add( s1(  X4 ) );
                X7.add( s0(  X8 ) ).add(  X0 ).add( s1(  X5 ) );
                B.add( f1( G, H, A ) ).add( K54 ).add(  X6 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K55 ).add(  X7 ); E.add( A ); A.add( f0( B, C, D ) );
                X8.add( s0(  X9 ) ).add(  X1 ).add( s1(  X6 ) );
                X9.add( s0( X10 ) ).add(  X2 ).add( s1(  X7 ) );
                H.add( f1( E, F, G ) ).add( K56 ).add(  X8 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K57 ).add(  X9 ); C.add( G ); G.add( f0( H, A, B ) );
                X10.add( s0( X11 ) ).add(  X3 ).add( s1(  X8 ) );
                X11.add( s0( X12 ) ).add(  X4 ).add( s1(  X9 ) );
                F.add( f1( C, D, E ) ).add( K58 ).add( X10 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K59 ).add( X11 ); A.add( E ); E.add( f0( F, G, H ) );
                X12.add( s0( X13 ) ).add(  X5 ).add( s1( X10 ) );
                X13.add( s0( X14 ) ).add(  X6 ).add( s1( X11 ) );
                D.add( f1( A, B, C ) ).add( K60 ).add( X12 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K61 ).add( X13 ); G.add( C ); C.add( f0( D, E, F ) );
                X14.add( s0( X15 ) ).add(  X7 ).add( s1( X12 ) );
                X15.add( s0(  X0 ) ).add(  X8 ).add( s1( X13 ) );
                B.add( f1( G, H, A ) ).add( K62 ).add( X14 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K63 ).add( X15 ); E.add( A ); A.add( f0( B, C, D ) );
                X0.add( s0(  X1 ) ).add(  X9 ).add( s1( X14 ) );
                X1.add( s0(  X2 ) ).add( X10 ).add( s1( X15 ) );
                H.add( f1( E, F, G ) ).add( K64 ).add(  X0 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K65 ).add(  X1 ); C.add( G ); G.add( f0( H, A, B ) );
                X2.add( s0(  X3 ) ).add( X11 ).add( s1(  X0 ) );
                X3.add( s0(  X4 ) ).add( X12 ).add( s1(  X1 ) );
                F.add( f1( C, D, E ) ).add( K66 ).add(  X2 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K67 ).add(  X3 ); A.add( E ); E.add( f0( F, G, H ) );
                X4.add( s0(  X5 ) ).add( X13 ).add( s1(  X2 ) );
                X5.add( s0(  X6 ) ).add( X14 ).add( s1(  X3 ) );
                D.add( f1( A, B, C ) ).add( K68 ).add(  X4 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K69 ).add(  X5 ); G.add( C ); C.add( f0( D, E, F ) );
                X6.add( s0(  X7 ) ).add( X15 ).add( s1(  X4 ) );
                X7.add( s0(  X8 ) ).add(  X0 ).add( s1(  X5 ) );
                B.add( f1( G, H, A ) ).add( K70 ).add(  X6 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K71 ).add(  X7 ); E.add( A ); A.add( f0( B, C, D ) );
                X8.add( s0(  X9 ) ).add(  X1 ).add( s1(  X6 ) );
                X9.add( s0( X10 ) ).add(  X2 ).add( s1(  X7 ) );
                H.add( f1( E, F, G ) ).add( K72 ).add(  X8 ); D.add( H ); H.add( f0( A, B, C ) );
                G.add( f1( D, E, F ) ).add( K73 ).add(  X9 ); C.add( G ); G.add( f0( H, A, B ) );
                X10.add( s0( X11 ) ).add(  X3 ).add( s1(  X8 ) );
                X11.add( s0( X12 ) ).add(  X4 ).add( s1(  X9 ) );
                F.add( f1( C, D, E ) ).add( K74 ).add( X10 ); B.add( F ); F.add( f0( G, H, A ) );
                E.add( f1( B, C, D ) ).add( K75 ).add( X11 ); A.add( E ); E.add( f0( F, G, H ) );
                X12.add( s0( X13 ) ).add(  X5 ).add( s1( X10 ) );
                X13.add( s0( X14 ) ).add(  X6 ).add( s1( X11 ) );
                D.add( f1( A, B, C ) ).add( K76 ).add( X12 ); H.add( D ); D.add( f0( E, F, G ) );
                C.add( f1( H, A, B ) ).add( K77 ).add( X13 ); G.add( C ); C.add( f0( D, E, F ) );
                X14.add( s0( X15 ) ).add(  X7 ).add( s1( X12 ) );
                X15.add( s0(  X0 ) ).add(  X8 ).add( s1( X13 ) );
                B.add( f1( G, H, A ) ).add( K78 ).add( X14 ); F.add( B ); B.add( f0( C, D, E ) );
                A.add( f1( F, G, H ) ).add( K79 ).add( X15 ); E.add( A ); A.add( f0( B, C, D ) );

                H0.add( A );
                H1.add( B );
                H2.add( C );
                H3.add( D );
                H4.add( E );
                H5.add( F );
                H6.add( G );
                H7.add( H );
            };
        }
        else {
            className += "-mini";

            // pre-allocating arrays, their instances MUST NOT change
            const X = ( new Array( 16 ) ).fill( 0 );
            X.forEach( ( e, i ) => X[i] = UINT64.zero() );

            // view: DataView, ofs: byte offset into view
            this.doBlock = function( view, ofs ) {
                X.forEach( ( x, i ) => {
                    x.hi = view.getUint32( ofs + 8 * i    , BIG_ENDIAN );
                    x.lo = view.getUint32( ofs + 8 * i + 4, BIG_ENDIAN );
                } );

                A.init( H0 ); B.init( H1 );
                C.init( H2 ); D.init( H3 );
                E.init( H4 ); F.init( H5 );
                G.init( H6 ); H.init( H7 );

                for( let i = 0; i < 80; i++ ) {
                    if( i >= 16 ) {
                        X[i & 15]
                            .add( s0( X[( i - 15 ) & 15] ) )
                            .add( X[( i - 7 ) & 15] )
                            .add( s1( X[( i - 2 ) & 15] ) );
                    }
                    H.add( f1( E, F, G ) ).add( K[i] ).add( X[i & 15] );
                    D.add( H ); H.add( f0( A, B, C ) );

                    const tmp = A; A = H; H = G; G = F; F = E; E = D;
                            D = C; C = B; B = tmp;
                }

                H0.add( A );
                H1.add( B );
                H2.add( C );
                H3.add( D );
                H4.add( E );
                H5.add( F );
                H6.add( G );
                H7.add( H );
            };
        }

        this.finalize = function() {
            const view = new DataView( new ArrayBuffer( HASH_SIZE_MAX ) );
            [ H0, H1, H2, H3, H4, H5, H6, H7 ]
                .forEach(
                    ( e, i ) => {
                        view.setUint32( 8 * i    , e.hi, BIG_ENDIAN );
                        view.setUint32( 8 * i + 4, e.lo, BIG_ENDIAN );
                    }
            );
            this.hash = view.buffer.slice( 0, hashSizeBits >> 3 );
        }

        this.init = function() {
            superClass.prototype.init.call( this );

            H0.init( IV[0] );
            H1.init( IV[1] );
            H2.init( IV[2] );
            H3.init( IV[3] );
            H4.init( IV[4] );
            H5.init( IV[5] );
            H6.init( IV[6] );
            H7.init( IV[7] );
        };

        this.getName = () => className;

        this.init();
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    return thisClass;
} )();

/**********************************************************************/

// class SHA512_224
const SHA512_224 = ( function() {

    const superClass = SHA512BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha512_224ref = new Map( [
        // ""
        [ 0, "6ed0dd02806fa89e25de060c19d3ac86cabb87d6a0ddd05c333b84f4" ],
        // "a"
        [ 1, "d5cdb9ccc769a5121d4175f2bfdd13d6310e0d3d361ea75d82108327" ],
        // "abc"
        [ 2, "4634270f707b6a54daae7530460842e20e37ed265ceee9a43e8924aa" ],
        // "\x55".repeat( 56 )
        [ 3, "8b36ef69277db77b6de2553690142ea26e28e8e18aa417b24702fde9" ],
        // "\xaa".repeat( 112 )
        [ 4, "8fe53e69f2ad6b19581335ab248ac4725ac654d62b03e2c964388374" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "a92dc992a8a0aebbaf6b1c4b8cfcdd360e98b4ba108dedb6ce2799eb" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "80e4994c1edcb5067b3af909900b5c111d2b6b50d634d5e5d56a9354" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "adabfab70ac8feb8241a2be520343f3f6d9dd5f976f0f6d43bb16d9b" ]
    ] );

    const IV = [
        new UINT64( 0x8C3D_37C8, 0x1954_4DA2 ), new UINT64( 0x73E1_9966, 0x89DC_D4D6 ),
        new UINT64( 0x1DFA_B7AE, 0x32FF_9C82 ), new UINT64( 0x679D_D514, 0x582F_9FCF ),
        new UINT64( 0x0F6D_2B69, 0x7BD4_4DA8 ), new UINT64( 0x77E3_6F73, 0x04C4_8942 ),
        new UINT64( 0x3F9D_85A8, 0x6A1D_36C8 ), new UINT64( 0x1112_E6AD, 0x91D6_92A1 )
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 224, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha512_224ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA512_256
const SHA512_256 = ( function() {

    const superClass = SHA512BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha512_256ref = new Map( [
        // ""
        [ 0, "c672b8d1ef56ed28ab87c3622c5114069bdd3ad7b8f9737498d0c01ecef0967a" ],
        // "a"
        [ 1, "455e518824bc0601f9fb858ff5c37d417d67c2f8e0df2babe4808858aea830f8" ],
        // "abc"
        [ 2, "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23" ],
        // "\x55".repeat( 56 )
        [ 3, "0be34f595e061f6cb635f442fcbd837caf49f2e9efce7d122ec7c7b6d18c44df" ],
        // "\xaa".repeat( 112 )
        [ 4, "be2964e951e913570150b22d76ca45b1802f09ec37b41769c3686c91b272cac5" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "a2825a4a7a767627dcf3502266f6cff2ed4a2f1c011764f1cb612a5d23b9b896" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "d678f4d5c9d86e33033b249b1f077c4b0bf6561163028b11e220ec74acf3ba05" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "3e3f007a573839dcd0b048c4dd7d173ee1d4f07ed5d4eda4a7ef16aa9b772ad8" ]
    ] );

    const IV = [
        new UINT64( 0x2231_2194, 0xFC2B_F72C ), new UINT64( 0x9F55_5FA3, 0xC84C_64C2 ),
        new UINT64( 0x2393_B86B, 0x6F53_B151 ), new UINT64( 0x9638_7719, 0x5940_EABD ),
        new UINT64( 0x9628_3EE2, 0xA88E_FFE3 ), new UINT64( 0xBE5E_1E25, 0x5386_3992 ),
        new UINT64( 0x2B01_99FC, 0x2C85_B8AA ), new UINT64( 0x0EB7_2DDC, 0x81C5_2CA2 )
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 256, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha512_256ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA512_384
const SHA512_384 = ( function() {

    const superClass = SHA512BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha512_384ref = new Map( [
        // ""
        [ 0, "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b" ],
        // "a"
        [ 1, "54a59b9f22b0b80880d8427e548b7c23abd873486e1f035dce9cd697e85175033caa88e6d57bc35efae0b5afd3145f31" ],
        // "abc"
        [ 2, "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7" ],
        // "\x55".repeat( 56 )
        [ 3, "7c1d28c4252dc78eadfd6b24c042490c24670e2682abdcfff6d3b8228ae2d5f732bcf887337256088a32c0dce774bd16" ],
        // "\xaa".repeat( 112 )
        [ 4, "0c1267ac84de9cd0c04ed81d41c7c50a79e62c17eec07312336dc7136bd655be5171113bc21e8236fb00be4986cb82ce" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "8a8edd50a7b186baa717b88dd3032afe87f2107e0c920cd03e4ae6f6bd5816b4f350ca3b2a953c362fb4d5765fdf6ce5" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "278fedd78334cb84ad5f89ef5663e6e71ccf922e5bf88fb147b4abfe75d42ff1bdc77bd845549d0ba84446721cf60122" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "8b7e1c37b328af82db69df8b3155f3ad39727b8aab47279ab2c3f3bf54e5150913024ce3dcd6bea1c03a1c97044dfcd7" ]
    ] );

    const IV = [
        new UINT64( 0xCBBB_9D5D, 0xC105_9ED8 ), new UINT64( 0x629A_292A, 0x367C_D507 ),
        new UINT64( 0x9159_015A, 0x3070_DD17 ), new UINT64( 0x152F_ECD8, 0xF70E_5939 ),
        new UINT64( 0x6733_2667, 0xFFC0_0B31 ), new UINT64( 0x8EB4_4A87, 0x6858_1511 ),
        new UINT64( 0xDB0C_2E0D, 0x64F9_8FA7 ), new UINT64( 0x47B5_481D, 0xBEFA_4FA4 )
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 384, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha512_384ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( NO_SPEED_TEST );
        ( new thisClass( UNROLLED_CODE ) ).pv( NO_SPEED_TEST );
    }

    return thisClass;
} )();

/**********************************************************************/

// class SHA512
const SHA512 = ( function() {

    const superClass = SHA512BASE;

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const sha512ref = new Map( [
        // ""
        [ 0, "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e" ],
        // "a"
        [ 1, "1f40fc92da241694750979ee6cf582f2d5d7d28e18335de05abc54d0560e0f5302860c652bf08d560252aa5e74210546f369fbbbce8c12cfc7957b2652fe9a75" ],
        // "abc"
        [ 2, "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f" ],
        // "\x55".repeat( 56 )
        [ 3, "72c40895663e5aec057ac817f4c428e9987667724578a75bbe5f5180974c9b845e8b2bd9c7889de6404af6bc66b4f8f7e153df0fef05ab90b5ea10f8ddd8bd44" ],
        // "\xaa".repeat( 112 )
        [ 4, "5ce067d614617a6d576178bd99740231471cc36002335f9c3a045f6ab74cffc5a20c6de33a36459118b5c149117cd67bcf4bc7ad436806856c38b07bbbf003e9" ],
        // "\x84\x42\x21\x10\x7b\xbd\xde\xef".repeat( 16 )
        [ 5, "162850a3ae604811c6dadc9f72eab5e62cc0274be94b0943022e5f5897dd3f0b403c664bd1ef05f78d5f61f909dbd8ac223e6d308105db7344d85b74fcd2780a" ],
        // "\xfe\xed\xdc\xcb\xba\xa9\x98\x87\x76\x65\x54\x43\x32\x21\x10".repeat( 128 )
        [ 6, "000761cbbaf10962b2011fdf5c8c630ff13116e080b8ccc514abbc05bd5d63751d2a3784634d2034f37f3e155db6c3f512cc9057309ca29dc513b9258d422210" ],
        // "\x00".repeat( 8 * 1024 * 1024 )
        [ 7, "cf76cca4e0f874d508f7e40fb84abc5789ca5f96c1e54e064f3be302766a59fc15a2efb7ffcc9692d13b906b2fe5a0215520d5e232ac69c754f2addb069580de" ]
    ] );

    const IV = [
        new UINT64( 0x6A09_E667, 0xF3BC_C908 ), new UINT64( 0xBB67_AE85, 0x84CA_A73B ),
        new UINT64( 0x3C6E_F372, 0xFE94_F82B ), new UINT64( 0xA54F_F53A, 0x5F1D_36F1 ),
        new UINT64( 0x510E_527F, 0xADE6_82D1 ), new UINT64( 0x9B05_688C, 0x2B3E_6C1F ),
        new UINT64( 0x1F83_D9AB, 0xFB41_BD6B ), new UINT64( 0x5BE0_CD19, 0x137E_2179 )
    ];

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function( unrolled ) {
        superClass.call( this, IV, 512, unrolled );
    };

    ////////////////////////////////////////////////////////////////////
    // class members / methods

    thisClass.prototype.verify = function() {
        return superClass.prototype.verify.call( this, sha512ref );
    };

    ////////////////////////////////////////////////////////////////////
    // class inheritance

    Object.setPrototypeOf( thisClass.prototype, superClass.prototype );

    ////////////////////////////////////////////////////////////////////
    // static class initialization

    if( doStartupPV ) {
        ( new thisClass( MINI_CODE ) ).pv( globalNoPVSpeedTest );
        ( new thisClass( UNROLLED_CODE ) ).pv( globalNoPVSpeedTest );
    }

    return thisClass;
} )();

/**********************************************************************/

// class DIGESTFACTORY
const DIGESTFACTORY = ( function() {

    ////////////////////////////////////////////////////////////////////
    // private static class variables / functions

    const digests = new Map( [
         [ "MD5",        MD5 ],
         [ "RIPEMD128",  RIPEMD128 ],
         [ "RIPEMD256",  RIPEMD256 ],
         [ "RIPEMD160",  RIPEMD160 ],
         [ "RIPEMD320",  RIPEMD320 ],
         [ "SHA1",       SHA1 ],
         [ "SHA224",     SHA224 ],
         [ "SHA256",     SHA256 ],
         [ "BLAKE2s128", BLAKE2s128 ],
         [ "BLAKE2s160", BLAKE2s160 ],
         [ "BLAKE2s224", BLAKE2s224 ],
         [ "BLAKE2s256", BLAKE2s256 ],
         [ "BLAKE2b160", BLAKE2b160 ],
         [ "BLAKE2b256", BLAKE2b256 ],
         [ "BLAKE2b384", BLAKE2b384 ],
         [ "BLAKE2b512", BLAKE2b512 ],
         [ "SHA512_224", SHA512_224 ],
         [ "SHA512_256", SHA512_256 ],
         [ "SHA512_384", SHA512_384 ],
         [ "SHA512",     SHA512 ]
    ] );

    ////////////////////////////////////////////////////////////////////
    // class constructor function

    const thisClass = function() {
        // nothing to do here
    };

    ////////////////////////////////////////////////////////////////////
    // static class methods

    thisClass.getInstance = ( digestName, variantName ) => {
        const digest = digests.get( digestName );
        if( variantName == "mini" )
            return new digest( MINI_CODE );
        else if( variantName == "unrolled" )
            return new digest( UNROLLED_CODE );
        else
            return new digest();
    };

    return thisClass;
} )();

/**********************************************************************/
