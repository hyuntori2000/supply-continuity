// Browser contract only. Bedrock calls and persistence belong to the backend.
export type IntakeCase={id:string;storeId:number;storeName:string;report:string;status:string;extraction:{product:string|null;lotCode:string|null;summary:string}|null;createdAt:string;error?:string};
