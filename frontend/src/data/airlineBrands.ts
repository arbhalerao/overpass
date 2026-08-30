export const DEFAULT_BRAND = '#8fa3c4'

export const AIRLINE_BRAND: Record<string, string> = {
  // europe
  BAW: '#4a86d9',
  // SHT: '#4a86d9', CFE: '#6fa8e0',
  DLH: '#f0c419', GEC: '#f0c419', CLH: '#e0b41a', EWG: '#d94f8a',
  AFR: '#4a7fd4', KLM: '#3ea1d6', KLC: '#3ea1d6',
  IBE: '#e8544f', IBS: '#e8544f',
  SWR: '#e0524f', AUA: '#e0524f', BEL: '#4a8fd4',
  SAS: '#4d94d6', FIN: '#4aa8e0', ICE: '#3fbfc9',
  TAP: '#5cc26a', ITY: '#4d7fd4', AEE: '#3fa9d6',
  LOT: '#4a90d9', CSA: '#5b8ad6', ROT: '#4a90d9', BTI: '#5cc26a',
  AFL: '#4a7fd4', THY: '#e05252', EIN: '#3fbf7f',
  VIR: '#e0455f', CFG: '#f0a03c', TRA: '#5cc26a', TVF: '#5cc26a',
  AEA: '#5b8ad6', DLA: '#6fa8d6', CTN: '#5b8ad6', LGL: '#4a90d9',
  LOG: '#5cc26a', TUI: '#4a8fd4',
  // europe, low cost
  RYR: '#3f7fd4', RUK: '#3f7fd4', EZY: '#f28c28', EJU: '#f28c28',
  WZZ: '#c86fd9', VLG: '#f5d33f', NAX: '#e0524f', NOZ: '#e0524f',
  EXS: '#e0455f', TOM: '#4a8fd4', PGT: '#f0c419', SXS: '#f0a03c',
  // middle East
  UAE: '#e0455f', ETD: '#d4a95c', QTR: '#a8467a', SVA: '#3fa87f',
  KAC: '#3f8fd4', OMA: '#c99a5b', GFA: '#c9a05c', RJA: '#5b8ad6',
  MEA: '#5cc26a', ELY: '#4a7fd4', FDB: '#f0a03c', ABY: '#e0455f',
  // south Asia
  AIC: '#e0524f', AXB: '#e0803c', IGO: '#5b7fd4', SEJ: '#e0455f',
  AKJ: '#f0803c',
  // PIA: '#3fa87f', BBC: '#3fa87f', ALK: '#c99a5b',
  // KZR: '#3fbfc9',
  // east and Southeast Asia
  SIA: '#d4a95c', CPA: '#3fa88f', HKE: '#8fd94f', AHK: '#3fa88f',
  // TGW: '#f0c419',
  CCA: '#e0524f', CES: '#5b8ad6', CSN: '#4a90d9', CHH: '#e0524f', CQH: '#5cc26a',
  CAL: '#5b8ad6', EVA: '#3fa87f', JAL: '#e0455f', ANA: '#4a7fd4', NCA: '#5b8ad6',
  KAL: '#4a90d9', AAR: '#e0803c', JNA: '#8fd94f', TWB: '#e0455f',
  THA: '#a86fd4', MAS: '#4a90d9', AXM: '#e0455f', GIA: '#3fa8c9',
  PAL: '#4a90d9', CEB: '#f0a03c', HVN: '#3fa88f', VJC: '#e0455f',
  BRU: '#f0c419', CRK: '#e0524f', CSZ: '#4a90d9', DKH: '#e0803c',
  CDG: '#5b8ad6', GCR: '#5cc26a',
  // oceania
  QFA: '#e0455f', JST: '#f0803c', VOZ: '#e0455f', ANZ: '#8fa3c4',
  // north America
  AAL: '#5b8ad6', UAL: '#4a7fd4', DAL: '#d94f5c', SWA: '#f0a03c',
  JBU: '#4a90d9', ASA: '#3fa87f', NKS: '#f0d93f', FFT: '#3fa87f',
  HAL: '#c86fa8', ACA: '#e0524f', ROU: '#e0803c', WJA: '#3fa8c9',
  AMX: '#5b8ad6', VOI: '#c86fd9',
  // latin America
  LAN: '#5b8ad6', TAM: '#e0455f', GLO: '#f0a03c', AZU: '#5b8ad6',
  ARG: '#3fa8c9', AVA: '#e0455f', CMP: '#5b8ad6',
  // africa
  ETH: '#5cc26a', MSR: '#4a7fd4',
  // RAM: '#e0455f', KQA: '#e0455f', SAA: '#3fa87f',
  // cargo and business aviation
  FDX: '#c86fd9', UPS: '#c9a05c', DHK: '#f0c419', BCS: '#f0c419',
  CLX: '#e0455f', GTI: '#5b8ad6', BOX: '#e0803c', AZG: '#3fa8c9',
  NJE: '#5b8ad6', EJA: '#5b8ad6', LXJ: '#c9a05c',
}

export function brandColor(icao: string | null | undefined): string {
  return (icao && AIRLINE_BRAND[icao]) || DEFAULT_BRAND
}
