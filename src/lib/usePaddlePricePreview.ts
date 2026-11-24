import {useEffect,useState} from 'react';
import {initializeLivePreview,localPreviewAllowed,localizedPrices,previewItems,type LocalizedPrices} from './paddleLive';

export function usePaddlePricePreview(){
  const token=import.meta.env.VITE_PADDLE_LIVE_CLIENT_TOKEN;
  const enabled=localPreviewAllowed(import.meta.env.DEV,location.hostname,token);
  const [prices,setPrices]=useState<LocalizedPrices>({});
  const [status,setStatus]=useState<'disabled'|'loading'|'ready'|'unavailable'>(enabled?'loading':'disabled');
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    initializeLivePreview(token)
      .then(client=>client.PricePreview({items:previewItems()}))
      .then(result=>{
        if(!active)return;
        const values=localizedPrices(result);
        setPrices(values);
        setStatus(values.pro&&values.institution?'ready':'unavailable');
      })
      .catch(()=>{if(active)setStatus('unavailable');});
    return ()=>{active=false;};
  },[enabled,token]);
  return {prices,status};
}
