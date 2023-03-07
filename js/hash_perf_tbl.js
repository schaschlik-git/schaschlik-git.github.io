"use strict";

function mkTable( id, title, rowcolHeader, columnHeaders, rowHeaders ) {
    const nColumns = columnHeaders.length;
    const nRows = rowHeaders.length;

    const caption = document.createElement( 'caption' );
    caption.innerText = title;

    const thead = document.createElement( 'thead' );
    const tr = document.createElement( 'tr' );
    const th = document.createElement( 'th' );
    th.innerText = rowcolHeader;
    tr.appendChild( th );
    for( let c = 0; c < nColumns; c++ ) {
        const th = document.createElement( 'th' );
        th.innerText = columnHeaders[c];
        tr.appendChild( th );
    }
    thead.appendChild( tr );

    const tbody = document.createElement( 'tbody' );
    for( let r = 0; r < nRows; r++ ) {
        const tr = document.createElement( 'tr' );
        const th = document.createElement( 'th' );
        th.innerText = rowHeaders[r];
        tr.appendChild( th );
        for( let c = 0; c < nColumns; c++ ) {
            const td = document.createElement( 'td' );
            td.id = `${id}[${r}][${c}]`;
            tr.appendChild( td );
        }
        tbody.appendChild( tr );
    }

    const table = document.createElement( 'table' );
    table.appendChild( caption );
    table.appendChild( thead );
    table.appendChild( tbody );

    const div = document.getElementById( id );
    div.appendChild( table );
}

function clearTable( id, nRows, nColumns ) {
    for( let r = 0; r < nRows; r++ )
        for( let c = 0; c < nColumns; c++ )
            document.getElementById( `${id}[${r}][${c}]` ).innerHTML = "";
}

const tasks = new Array( 0 );
const maxRunningTasks = navigator.hardwareConcurrency > 2
    ? navigator.hardwareConcurrency : 2;

function schedule() {
    while( true ) {
        // filter out completed/deleted tasks
        const allTasks = tasks.filter( () => true );

        // all work is done :)
        if( allTasks.length == 0 ) {
            if( schedule.onAllDone !== undefined )
                schedule.onAllDone();
            return;
        }

        const idleTasks = tasks.filter( ( task ) => task.state == "idle" );
        const runningTasks = tasks.filter( ( task ) => task.state == "run" );

        if( runningTasks.length >= maxRunningTasks
                || idleTasks.length == 0 ) {
            setTimeout( schedule, 500 ); // re-schedule
            return;
        }

        const task = idleTasks.shift();

        if( schedule.canTerminateTask !== undefined
            && schedule.canTerminateTask( task ) ) {
            task.worker.terminate();
            delete tasks[task.workerId];
            continue;
        }

        task.state = "run";
        task.args.run = task.run++;
        task.worker.postMessage( task.args );
    }
}

function queueTask( script, args, callback ) {
    const workerId = tasks.length;

    const task = {
        workerId: workerId,
        args: args,
        state: "idle",
        run: 0,
        worker: new Worker( script )
    };

    task.args.workerId = workerId;

    task.worker.onmessage = ( msg ) => {
        const workerId = msg.data.workerId;
        const task = tasks[workerId];
        task.state = "idle";

        callback( msg.data );

        schedule();
    };

    tasks.push( task );

    schedule();
}

window.onload = () => {
    const DIGESTS = [
        "MD5-mini",        "MD5-unrolled",
        "SHA1-mini",       "SHA1-unrolled",
        "RIPEMD128-mini",  "RIPEMD128-unrolled",
        "RIPEMD256-mini",  "RIPEMD256-unrolled",
        "RIPEMD160-mini",  "RIPEMD160-unrolled",
        "RIPEMD320-mini",  "RIPEMD320-unrolled",
        "SHA256-mini",     "SHA256-unrolled",
        "SHA512-mini",     "SHA512-unrolled",
        "BLAKE2s256-mini", "BLAKE2s256-unrolled",
        "BLAKE2b512-mini", "BLAKE2b512-unrolled"
    ];

    const maxRuns = 6;

    const tbl_id = "hash_perf_tbl";

    mkTable( tbl_id,
        "Speed [MiB/s]",
        "digest \\ run#",
        ( new Array( maxRuns ) ).fill( 0 ).map( ( e, i ) => i + 1 ),
        DIGESTS
    );

    function updateTable( args ) {
        const row = args.row;
        const column = args.run;
        const item = document.getElementById( `${tbl_id}[${row}][${column}]` );
        if( item === null )
            return;
        item.innerHTML = args.speed.toFixed( 1 );
    }

    let firstRun = true;
    const button = document.getElementById( "hash_perf_button" );
    button.onclick = () => {
        button.disabled = true;

        if( ! firstRun )
            clearTable( tbl_id, DIGESTS.length, maxRuns );
        firstRun = false;

        DIGESTS.forEach( ( name, i ) => queueTask(
            "js/hash_perf_worker.js", { row: i, name: name },
                updateTable ) );
    };

    schedule.onAllDone = () => button.disabled = false;
    schedule.canTerminateTask = ( task ) => task.run == maxRuns;
};
