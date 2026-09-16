import {instructions,tool,context,type State} from './commerce';
export const liveSession={model:'gpt-live-1',instructions:'You are Surface. Speak only English, in one sentence of at most 25 words. Let the screen carry the details; give the useful takeaway without reading lists aloud or narrating tool use. All catalog prices are in euros, never dollars. Delegate every search, product question, review topic, comparison, or navigation request to your backend. Keep listening until the user explicitly asks to stop. Never invent facts. The catalog has 144 demo items: T-shirts, jeans and jackets in red, blue, green, black, white, pink, yellow and purple. A simple request such as red T-shirts is sufficient: delegate immediately, without asking which kind, size, age or budget. An empty current screen is not evidence of an empty catalog. Wait for the user before speaking. The screen changes with each answer. Product cards show suitability reasons for the shopper need; do not read those reasons aloud unless explicitly asked.',audio:{output:{voice:'marin'}},delegation:{type:'responses',responses:{model:'gpt-5.6-terra',instructions,tools:[tool,{type:'function',name:'stop_listening',description:'Stop voice only on explicit request.',parameters:{type:'object',properties:{},additionalProperties:false}}],tool_choice:'auto',parallel_tool_calls:false}}};
export type LiveFunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
};
/** Live wraps Responses events; terminal snapshots omit their output items. */
export class LiveToolBatches {
  private pending = new Map<string, LiveFunctionCall[]>();
  private seen = new Set<string>();
  private activeResponses = new Map<string, string>();
  receive(envelope: any): LiveFunctionCall[] {
    if (envelope.type !== 'response.event') return [];
    const event = envelope.event;
    const delegation = envelope.delegation_id ?? 'manual';
    if (event.type === 'response.created') {
      const id = event.response.id;
      this.activeResponses.set(delegation, id);
      this.pending.set(id, []);
    }
    const key =
      event.response?.id ?? this.activeResponses.get(delegation) ?? delegation;
    if (
      event.type === 'response.output_item.done' &&
      event.item?.type === 'function_call'
    ) {
      const call = event.item as LiveFunctionCall;
      if (!this.seen.has(call.call_id)) {
        this.seen.add(call.call_id);
        this.pending.set(key, [...(this.pending.get(key) ?? []), call]);
      }
    }
    if (
      ['response.failed', 'response.incomplete', 'response.cancelled'].includes(
        event.type,
      )
    ) {
      this.pending.delete(key);
      return [];
    }
    if (event.type !== 'response.completed') return [];
    const calls = this.pending.get(key) ?? [];
    this.pending.delete(key);
    return calls;
  }
}

/** Full backend context plus a compact live-model update (500-token API limit). */
export function screenContextEvents(state:State){
 const data=context(state);
 const summary=JSON.stringify({view:state.view,active:state.active,topic:state.topic.slice(0,60),visible:data.visible.map(p=>({number:p.number,id:p.id}))});
 return [{type:'response.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Application context updated (not a new request): '+JSON.stringify(data)}]}},{type:'session.thinking.append',event_id:crypto.randomUUID(),content:'Current screen: '+summary,delegation_id:null}];
}
