export const liveModels = [
  {id:'gpt-live-1', label:'GPT Live 1'},
  {id:'gemini-3.8-live', label:'Gemini Live 3.8'},
  {id:'gemini-3.8-live-extended-thinking', label:'Gemini Live 3.8 Extended Thinking'},
] as const;
export type LiveModel = typeof liveModels[number]['id'];
export function isLiveModel(value:unknown):value is LiveModel {return liveModels.some(m=>m.id===value);}
export const modelLabel = (model:LiveModel)=>liveModels.find(m=>m.id===model)!.label;
