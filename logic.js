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
  proofSocket: "ws://localhost:7788",
  // proofSocket:"ws://138.201.202.27:27788", //still just firehose relayer
  bridgeContract:"bridge3",
  wrapLockContractsArray: ["wlockandy1"],
  session:null,
  wrapLockContracts: [],
  symbols:null,
  auth:null,
}];

let sourceChain, destinationChain, tokenRow, progress;
//on DOM ready
$(async function() {
  console.log("ready")
  //fetch wraplock contracts tokens & details
  for (var chain of chains) {
    for (var wrapLockContract of chain.wrapLockContractsArray) {
      let details = await fetch(`${chain.nodeUrl}/v0/state/table?account=${wrapLockContract}&table=global&scope=${wrapLockContract}&json=true`);
      details = await details.json();
      details = details.rows[0];
      if (details && details.json.bridge_contract === chain.bridgeContract) {
        let symbolsres = await fetch(`${chain.nodeUrl}/v0/state/table_scopes?account=${details.json.native_token_contract}&table=stat`);
        symbolsres = await symbolsres.json();
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

  //add chain options to chain select elements
  for (var chain of chains) {
    $('#sourceChain').append(new Option(chain.label, chain.name));
    $('#destinationChain').append(new Option(chain.label, chain.name));
  }

});

//handler for source chain change
const sourceChainChanged = val =>{
  const sourceChain = chains.find(c=>c.name==val);
  const destinationChain = chains.find(c=>c.name !== val);
  $("#destinationChain").val(destinationChain.name);
  $('#sourceLogin').show();
  $('#destinationLogin').show();

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
  sourceChain =  chains.find(c=>c.name===$(`#sourceChain`).val());
  destinationChain =  chains.find(c=>c.name===$(`#destinationChain`).val());
  tokenRow = sourceChain.symbols.find(r=>r.id===parseInt($('#sourceAsset').val()));
  console.log("tokenRow",tokenRow)
  let amount = parseFloat($("#amount").val());
  const quantity = `${amount.toFixed(4)} ${tokenRow.symbol}`

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
    console.log("emitxferAction to prove", emitxferAction)

    const transferProofAction = await getProof({
      type: "heavyProof",
      action: emitxferAction,
      block_to_prove: emitxferAction.block_num //block that includes the emitxfer action we want to prove
    });
    

    //submit proof to destination chain's bridge contract
    let destinationActions = [transferProofAction];

    //ADD schedule proofs to actions;

    console.log("destinationActions",destinationActions)

    console.log(JSON.stringify(destinationActions))
    
    destinationChain.session.transact({actions: destinationActions}).then((result) => {
      console.log("result", result);
      window.open(destinationChain.nodeUrl + '/tx/' + result.processed.id);
    }).catch(err=>{
      console.log("Error submitting transaction", err);
    })

  })
}


const getProof = ({type, block_to_prove, action}) => {
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
      console.log("Received message from ibc proof server", res);

      if (res.type =='progress') return progress = res.progress;

      if (res.type !=='proof') return;
      ws.close();

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