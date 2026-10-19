import type { Document, Workspace } from './types';

const scaled=(value:string,places:number)=>{if(!/^\d{1,11}(\.\d+)?$/.test(value))return 0n;const [w,f='']=value.split('.');return BigInt(w)*10n**BigInt(places)+BigInt(f.padEnd(places,'0').slice(0,places));};
const decimal=(value:bigint,places:number)=>`${value/10n**BigInt(places)}.${String(value%10n**BigInt(places)).padStart(places,'0')}`.replace(/\.?0+$/,'');
export const lineValue=(quantity:string,price:string)=>decimal((scaled(quantity,6)*scaled(price,4)+500000n)/1000000n,4);
export const orderValue=(lines:{quantity:string;unitPrice:string}[])=>decimal((lines.reduce((n,l)=>n+scaled(l.quantity,6)*scaled(l.unitPrice,4),0n)+500000n)/1000000n,4);
export const inr=(value:string)=>{const [whole,fraction='']=value.split('.');return `₹${BigInt(whole||'0').toLocaleString('en-IN')}${fraction&&/[1-9]/.test(fraction)?'.'+fraction.replace(/0+$/,''):''}`;};
const csvCell=(value:unknown)=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function purchaseCsv(order:Document,w:Workspace){
 const supplier=w.suppliers.find(p=>p.id===order.supplierId);
 const rows:unknown[][]=[['FORGE PURCHASE ORDER'],['Company',w.company.name],['Reference',order.code],['Status',order.status],['Order date',order.orderDate||order.createdAt.slice(0,10)],['Expected delivery',order.expectedDate],['Supplier',order.supplierName],['Supplier email',supplier?.email],['Supplier phone',supplier?.phone],['Supplier address',supplier?.address],['Supplier reference',order.supplierReference],['Warehouse',order.warehouseName],['Delivery address',order.deliveryAddress],['Payment terms',order.paymentTerms],['Notes',order.notes],[],['Item','Unit','Ordered quantity','Received quantity','Unit price (INR)','Line value (INR)'],...order.lines.map(l=>[l.itemName,l.unit,l.quantity,l.receivedQuantity||'0',l.unitPrice,lineValue(l.quantity,l.unitPrice)]),[],['Order total (INR)',order.total],['Document type','Purchase order - not a tax invoice']];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export function downloadPurchaseCsv(order:Document,w:Workspace){
 const url=URL.createObjectURL(new Blob([purchaseCsv(order,w)],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download=`${order.code.replace(/[^A-Za-z0-9_-]/g,'_')}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
