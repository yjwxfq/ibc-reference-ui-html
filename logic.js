//chain Info;
const chains = [{
  chainId: 'df383d1cc33cbb9665538c604daac13706978566e17e5fd5f897eff68b88e1e4',
  nodeUrl: 'https://eostestnet.goldenplatform.com',
  name: "eostestnet",
  label: "EOS Testnet",
  proofSocket: "ws://195.201.60.252:7788",
  // proofSocket: "wss://eostestnet.goldenplatform.com/ibc", //TODO fix nginx closing connection
  bridgeContract:"bridge3",
  wrapLockContractsArray: ["wlockandy1"],
  session:null,
  wrapLockContracts: [],
  symbols:null,
  auth:null,
},{
  chainId: '83ce967e4a9876d2c050f859e710a58bb06f2d556843391ff28b0c1a95396402',
  nodeUrl: 'https://uxtestnet.goldenplatform.com',
  name: "uxtestnet",
  label: "UX Testnet",
  proofSocket: "ws://95.216.45.172:7788",
  bridgeContract:"bridge3",
  wrapLockContractsArray: ["wlockandy1"],
  session:null,
  wrapLockContracts: [],
  symbols:null,
  auth:null,
}];

let sourceChain, destinationChain, tokenRow, progress;

fetchTokens();
async function fetchTokens(){
  //fetch wraplock contracts tokens & details
  for (var chain of chains) {
    for (var wrapLockContract of chain.wrapLockContractsArray) {
      let details = await $.get(`${chain.nodeUrl}/v0/state/table?account=${wrapLockContract}&table=global&scope=${wrapLockContract}&json=true`);
      details = details.rows[0];
      if (details && details.json.bridge_contract === chain.bridgeContract) {
        let symbolsres = await $.get(`${chain.nodeUrl}/v0/state/table_scopes?account=${details.json.native_token_contract}&table=stat`);
        let symbols = symbolsres.scopes.map(r => toName(nameToUint64(r)));
        chain.wrapLockContracts.push({
          chain_id: details.json.chain_id,
          wrapLockContract,
          nativeTokenContract: details.json.native_token_contract,
          pairedChainId: details.json.paired_chain_id,
          pairedWrapTokenContract: details.json.paired_wraptoken_contract,
          symbols
        });
      }
    }
  }
  //on DOM ready
  $(async function() {
    //add chain options to chain select elements
    for (var chain of chains) {
      $('#sourceChain').append(new Option(chain.label, chain.name));
      $('#destinationChain').append(new Option(chain.label, chain.name));
    }
  
    // $("#sourceChain").val("uxtestnet");
    // sourceChainChanged("uxtestnet");
    console.log("ready");
  });

}

//handler for source chain change
const sourceChainChanged = val =>{


  const sourceChain = chains.find(c=>c.name==val);
  const destinationChain = chains.find(c=>c.name !== val);
  $("#destinationChain").val(destinationChain.name);
  $('#sourceLogin').show();
  $('#destinationLogin').show();

  $('#lastProven').html("");
  $('#activeSchedule').html("");
  $('#pendingSchedule').html("");
  $('#status').html("");

  //set sourceChain symbols if not yet set
  if (!sourceChain.symbols) {
    let nativeList = [];
    let id = 1;
    for (var row of sourceChain.wrapLockContracts)
      for (var symbol of row.symbols) {
        nativeList.push({
          ...row,
          id,
          wrapLockContract: row.wrapLockContract,
          symbol,
          sourceTokenContract: row.nativeTokenContract,
          destinationTokenContract: row.pairedWrapTokenContract,
          native: true
        });
        id++;
      }
    nativeList =  nativeList.sort((a, b) => (a.symbol > b.symbol ? 1 : -1));

    let wrappedList = [];
    id = 1000;
    for (var row of destinationChain.wrapLockContracts)
      for (var symbol of row.symbols) {
        wrappedList.push({
          ...row,
          id,
          symbol,
          wrapLockContract: row.wrapLockContract,
          sourceTokenContract: row.pairedWrapTokenContract,
          destinationTokenContract: row.nativeTokenContract,
          native: false
        });
        id++;
      }
    wrappedList = wrappedList.sort((a, b) => (a.symbol > b.symbol ? 1 : -1));

    sourceChain.symbols = [...nativeList, ...wrappedList];
  }

  console.log(sourceChain.symbols)

  //clear Token select options
  $('#sourceAsset').find('option').remove().end();
  $('#sourceAsset').find('optgroup').remove().end();

  //set Token select options
  let optionsHtml = `<optgroup label="Native">`
  for (var r of sourceChain.symbols.filter(r=>r.native)) optionsHtml+=`<option value=${r.id}>${r.symbol}</option>`;
  optionsHtml+=`</optgroup><optgroup label="Wrapped">`;
  for (var r of sourceChain.symbols.filter(r=>!r.native)) optionsHtml+=`<option value=${r.id}>${r.symbol}</option>`;
  optionsHtml+=`</optgroup>`;

  $('#sourceAsset').append(optionsHtml);

}


//UI functions
function login(type){
  const chain =  chains.find(c=>c.name===$(`#${type}Chain`).val());
  const link = new AnchorLink({
    transport: new AnchorLinkBrowserTransport(),
    chains: [{ chainId: chain.chainId, nodeUrl: chain.nodeUrl}]
  })
  link.login("IBC")
    .then((result) => {
      chain.session = result.session;
      chain.auth = {
        actor:chain.session.auth.actor.toString(),
        permission: chain.session.auth.permission.toString()
      }
      $(`#${type}Login`).hide();
      $(`#${type}Logout`).text(`Logout ${chain.auth.actor}@${chain.auth.permission}`);
      $(`#${type}Logout`).show();
      $(`#${type}Chain`).prop('disabled', true);
    })
    .catch(ex=> alert(ex));
}

function logout(type){
  const chain =  chains.find(c=>c.name===$(`#${type}Chain`).val());
  chain.session?.remove();
  chain.session = null;
  chain.auth = null;
  $(`#${type}Logout`).hide();
  $(`#${type}Login`).show();
  console.log(chains)
  if (!chains.find(c=>c.session) ) $(`#sourceChain`).prop('disabled', false);
}

//transfer function to lock or retire tokens
const transfer = async () => {
  //get values form UI
  sourceChain =  chains.find(c=>c.name===$(`#sourceChain`).val());
  destinationChain =  chains.find(c=>c.name===$(`#destinationChain`).val());
  tokenRow = sourceChain.symbols.find(r=>r.id===parseInt($('#sourceAsset').val()));
  let amount = parseFloat($("#amount").val());
  const quantity = `${amount.toFixed(4)} ${tokenRow.symbol}`;
  
  console.log("tokenRow",tokenRow)

  let sourceActions;

  //TODO add check for balance and conditionally open balance

  //if native token, then transfer token to the wraplock token and lock it
  if (tokenRow.native) sourceActions = [
    openBalance({ tokenRow, chain:sourceChain }),
    transferToken({ tokenRow, chain:sourceChain, quantity }),
    lockToken({ tokenRow,sourceChain, quantity, destinationChain }),
  ];
  //if retiring tokens from a non-native chain
  else sourceActions = [ retireWrappedToken({ tokenRow, sourceChain, destinationChain, quantity }) ];

  console.log("sourceActions",sourceActions)
  sourceChain.session.transact({actions: sourceActions}).then( async result => {
    console.log(result)
    console.log(result.processed.id);

    const lockActionTrace = result.processed.action_traces.find(r=>r.act.name==='lock' || r.act.name==='retire');
    const emitxferAction = lockActionTrace.inline_traces.find(r=>r.act.name==='emitxfer');
    //show tx explorer link in UI
    console.log("emitxferAction to prove", emitxferAction);


    //Get schedule proofs;
    const scheduleProofs = await getScheduleProofs();
    console.log("scheduleProofs",scheduleProofs)
    if (!scheduleProofs) return  $('#status').append(`<div><div>Error, no scheduleProofs</div><div class="progressDiv"></div>`);
    $('#status').append(`<div><div>Fetching proof for emitxfer...</div><div class="progressDiv"></div>`);
    const emitxferProof = await getProof({
      type: "heavyProof",
      action: emitxferAction,
      block_to_prove: emitxferAction.block_num //block that includes the emitxfer action we want to prove
    });
    
    console.log("emitxferProof",emitxferProof)

    //submit proof to destination chain's bridge contract
    let destinationActions = [...scheduleProofs, emitxferProof];

    console.log("destinationActions",destinationActions)
    $('#status').append(`<div>Submitting Proofs...</div>`);

    destinationChain.session.transact({actions: destinationActions}).then((result) => {
      console.log("result", result);
      $('#status').append(`<div style="margin-top:24px;"><a target="_blank" style="color:#1a8754" href="${destinationChain.nodeUrl}/tx/${result.processed.id}">TX ID<a></div>`);

    }).catch(err=>{
      console.log("Error submitting transaction", err);
    })

  })
}

const getScheduleProofs = async () => {
  async function getProducerScheduleBlock(blocknum) {
    try{
      console.log("getProducerScheduleBlock fetching block", blocknum);
      const sourceAPIURL = sourceChain.nodeUrl+"/v1/chain";
      var header = await $.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}));
      console.log("header",header)
      let target_schedule = header.schedule_version;
      
      let min_block = 2;
      //fetch last proved block to use as min block for schedule change search 
      const lastBlockProved = await $.post(destinationChain.nodeUrl+ '/v1/chain/get_table_rows', JSON.stringify({
        code: destinationChain.bridgeContract,
        table: "lastproofs", 
        scope: sourceChain.name,
        limit: 1, reverse: true, show_payer: false, json: true
      }));

      if (lastBlockProved) min_block = lastBlockProved.rows[0].block_height;

      let max_block = blocknum;
      console.log("checking range",min_block + " -> " + max_block);
      
      //detect active schedule change
      while (max_block - min_block > 1) {
        console.log("checking blocknum",blocknum)
        blocknum = Math.round((max_block + min_block) / 2);
        header = await $.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}));
        if (header.schedule_version < target_schedule) min_block = blocknum;
        else max_block = blocknum;
      }
      //TODO might be as little as 180 blocks (15 producers * 12 blocks) behind. DO some math, fins max blocks behind it can bo and start from there and increment blocks;
      if (blocknum > 336) blocknum -= 336;
      //search before active schedule change for new_producer_schedule 
      let bCount = 0;
      while (blocknum < max_block && !("new_producer_schedule" in header)) {
        header = await $.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}));
        bCount++;
        blocknum++;
      }
      blocknum--;
      console.log('blocks checked for new_producer_schedule', bCount);
      console.log("block with header for schedule V" + header.new_producer_schedule.version, blocknum)
      return blocknum;  
    }catch(ex){ 
      console.log("getProducerScheduleBlock ex",ex)
      return null;}
  }

  console.log("\ngetScheduleBlocksToProve:");
  const proofs = [];
  //get head block
  const head_block = parseInt((await $.get(sourceChain.nodeUrl+ '/v1/chain/get_info')).head_block_num);;
  // let schedule_block = parseInt((await $.get(sourceChain.nodeUrl+ '/v1/chain/get_info')).head_block_num);
  console.log("Chain's head block number", head_block);

  const bridgeScheduleData = (await $.post(destinationChain.nodeUrl+ '/v1/chain/get_table_rows', JSON.stringify({
    code: destinationChain.bridgeContract,
    table: "schedules", 
    scope: sourceChain.name,
    limit: 1, reverse: true, show_payer: false, json: true
  })));
  console.log("bridgeScheduleData",bridgeScheduleData);
  
  var last_proven_schedule_version = 0;
  if (bridgeScheduleData.rows.length > 0) last_proven_schedule_version = bridgeScheduleData.rows[0].producer_schedule.version;

  if (!last_proven_schedule_version) return console.log('No Schedule Found in Contract!');

  console.log('Last Proven schedule version: ' + last_proven_schedule_version);

  let schedule = (await $.get(sourceChain.nodeUrl+ '/v1/chain/get_producer_schedule'));
  var schedule_version = parseInt(schedule.active.version);
  console.log("Active schedule version", schedule_version);

  //update UI schedule status
  $("#lastProven").html("v"+last_proven_schedule_version);
  $("#activeSchedule").html("v"+schedule_version);
  if (schedule.pending) $('#pendingSchedule').html("YES"); else $('#pendingSchedule').html("NO"); 

  let schedule_block = head_block;
  while (schedule_version > last_proven_schedule_version) {
    $('#status').append(`<div><div>Locating block header with producer schedule (v${schedule_version})...</div><div class="progressDiv"></div>`);

    let block_num = await getProducerScheduleBlock(schedule_block);
    console.log("getProducerScheduleBlock returned block_num",block_num)
    if (!block_num) return; //should never occur
    $('#status').append(`<div><div>Fetching proof for active schedule (v${schedule_version})...</div><div class="progressDiv"></div>`);
    var proof = await getProof({block_to_prove: block_num});
    console.log("schedule proof",block_num, proof)
    schedule_version = proof.data.blockproof.blocktoprove.block.header.schedule_version;
    console.log("schedule_version",schedule_version)
    // schedule_block = proof.data.blockproof.blocktoprove.block.block_num;
    schedule_block = block_num;
    proofs.unshift(proof);
  };

  // check for pending schedule and prove pending schedule if found;
  if (schedule.pending) {
    $('#status').append(`<div><div>Fetching proof for pending schedule...</div><div class="progressDiv"></div>`);
    console.log("Found a pending schedule")
    console.log("New schedule version required",schedule_version+1)

    let newPendingBlockHeader=null;
    let currentBlock = head_block;
    while(!newPendingBlockHeader){
      let bHeader = (await $.post(`${sourceChain.nodeUrl}/v1/chain/get_block`, JSON.stringify({ block_num_or_id: currentBlock })));
      if (bHeader['new_producer_schedule']) newPendingBlockHeader = bHeader;
      else currentBlock--;
    }
    console.log("newPendingBlockHeader found",newPendingBlockHeader);
    var pendingProof = await getProof({block_to_prove: newPendingBlockHeader.block_num});
    console.log("pending schedule proof",newPendingBlockHeader.block_num, pendingProof);
    proofs.push(pendingProof); //push pending after proving active
  } 

  return proofs;
};

const getProof = ({type="heavyProof", block_to_prove, action}) => {
  return new Promise(resolve=>{
    //initialize socket to proof server
    const ws = new WebSocket(sourceChain.proofSocket);

    ws.addEventListener('close', (event) => { console.log("close event",event) });

    ws.addEventListener('open', (event) => {
      // connected to websocket server
      const query = { type, block_to_prove };
      if (action) query.action_receipt = action.receipt;
      ws.send(JSON.stringify(query));
    });

    //messages from websocket server
    ws.addEventListener('message', (event) => {
      // console.log("data from proof server",event.data);
      const res = JSON.parse(event.data);
      if (res.type !=='progress') console.log("Received message from ibc proof server", res);

      if (res.type =='progress') $('.progressDiv').last().html(res.progress +"%");

      if (res.type !=='proof') return;
      ws.close();
      $('.progressDiv').last().html("100%");

      //handle issue/withdraw if proving lock/retire 's emitxfer action, else submit block proof to bridge directly (for schedules)
      const actionToSubmit = { 
        authorization: [destinationChain.auth],
        name: !action ? "checkproofa" : tokenRow.native ? "issue" : "withdraw",
        account: !action ? destinationChain.bridgeContract : tokenRow.native ? tokenRow.pairedWrapTokenContract : tokenRow.wrapLockContract,
        data: { ...res.proof, prover: destinationChain.auth.actor } 
      };

      //if proving an action, add action and formatted receipt to actionproof object
      if (action) actionToSubmit.data.actionproof = {
        ...res.proof.actionproof,
        action: {
          account: action.act.account,
          name: action.act.name,
          authorization: action.act.authorization,
          data: action.act.hex_data
        },
        receipt: {
          ...action.receipt,
          auth_sequence: [{ account: action.receipt.auth_sequence[0][0], sequence: action.receipt.auth_sequence[0][1] }]
        },
      }

      let blockproof = actionToSubmit.data.blockproof;

      //format timestamp in headers
      for (var bftproof of blockproof.bftproof) bftproof.header.timestamp = bftproof.header.timestamp.slice(0,-1);

      blockproof.blocktoprove.block.header.timestamp = blockproof.blocktoprove.block.header.timestamp.slice(0,-1);

      resolve(actionToSubmit);
    });
  });
}

//action creation functions
const openBalance = ({tokenRow, chain}) => ({
  account: tokenRow.wrapLockContract,
  name: "open",
  authorization: [chain.auth],
  data: {
    owner: chain.auth.actor,
    symbol: `4,${tokenRow.symbol}`,
    ram_payer: chain.auth.actor
  }
});

const transferToken = ({tokenRow, chain, quantity} ) => ({
  account: tokenRow.nativeTokenContract,
  name: "transfer",
  authorization: [chain.auth],
  data: {
    from: chain.auth.actor,
    to: tokenRow.wrapLockContract,
    quantity,
    memo: "transfer to wrap lock token"
  }
});

const lockToken = ({ tokenRow, sourceChain, quantity, destinationChain }) => ({
  account: tokenRow.wrapLockContract,
  name: "lock",
  authorization: [sourceChain.auth],
  data: {
    owner: sourceChain.auth.actor,
    quantity,
    beneficiary: destinationChain.auth.actor
  }
});

const issueWrappedToken = ({ tokenRow, destinationChain, action_receipt_digest }) => ({
  account: tokenRow.pairedWrapTokenContract,
  name: "issue",
  authorization: [destinationChain.auth],
  data: { caller: destinationChain.auth.actor, action_receipt_digest }
});

const retireWrappedToken = ({ tokenRow, sourceChain, destinationChain, quantity }) => ({
    account: tokenRow.sourceTokenContract,
    name: "retire",
    authorization: [sourceChain.auth],
    data: {
      owner: sourceChain.auth.actor,
      quantity,
      beneficiary: destinationChain.auth.actor
    }
});

const withdrawNativetoken = ({ tokenRow, destinationChain, action_receipt_digest }) => ({
    account: tokenRow.wrapLockContract,
    name: "withdraw",
    authorization: [destinationChain.auth],
    data: { caller: destinationChain.auth.actor, action_receipt_digest }
});


//eosio name helper functions
const char_to_symbol = (c) => {
  if (typeof c == 'string') c = c.charCodeAt(0);
  if (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) return c - 'a'.charCodeAt(0) + 6;
  if (c >= '1'.charCodeAt(0) && c <= '5'.charCodeAt(0)) return c - '1'.charCodeAt(0) + 1;
  return 0;
};

const toName = (value) => {
  let v = BigInt.asUintN(64, value);
  let result = '';
  while (v > 0) {
    const c = v & BigInt(0xff);
    result += String.fromCharCode(Number(c.toString()));
    v >>= 8n;
  }
  return result;
};

const nameToUint64 = (s) => {
  let n = 0n;
  let i = 0;
  for (; i < 12 && s[i]; i++) 
    n |= BigInt(char_to_symbol(s.charCodeAt(i)) & 0x1f) << BigInt(64 - 5 * (i + 1));
  if (i == 12) 
    n |= BigInt(char_to_symbol(s.charCodeAt(i)) & 0x0f);
  return n.toString();
};