import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateIntent,privateResult} from '../../functions/_lib/operator_commands.js';
test('bounded English saved-idea read variants stay deterministic and read-only',()=>{
 for(const text of ['Show my saved campaign ideas','List my saved ideas','Open the saved campaign ideas','Read saved ideas','Please show my saved campaign ideas.','Could you please show me my saved campaign ideas?','Can you list my saved ideas please?','Would you read my saved ideas?']){
  const r=privateResult(privateIntent(text));assert.equal(r?.ui?.kind,'saved_ideas',text);assert.equal(r.receipt.mutation,false);
 }
});
test('bounded Spanish read variants support accents, possessives and polite prefixes',()=>{
 for(const text of ['Mostrar mis ideas guardadas','Muéstrame mis ideas de campaña guardadas','Por favor, abre mis ideas guardadas','¿Puedes leer mis ideas guardadas de campaña?','Podrías por favor listar las ideas guardadas','Muestra mis ideas guardadas, por favor'])assert.equal(privateIntent(text).kind,'saved_ideas',text);
});
test('compound publishing sending and scheduling requests cannot become retrieval',()=>{
 for(const text of ['Show my saved campaign ideas and publish them','Please send my saved campaign ideas','Schedule my saved ideas','Open my saved ideas and email them','Mostrar mis ideas guardadas y publicar','Por favor enviar mis ideas guardadas','Programar mis ideas guardadas'])assert.equal(privateIntent(text).kind,'refusal',text);
});
test('ambiguous or unrelated requests never falsely claim saved idea retrieval',()=>{
 for(const text of ['show my ideas','show my saved orders','delete my saved campaign ideas','show saved campaign ideas from another owner','I think my saved campaign ideas are good','read my saved campaign ideas then delete them'])assert.equal(privateResult(privateIntent(text)),null,text);
});
