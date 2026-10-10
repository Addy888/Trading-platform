/**
 * Angel One SmartAPI Type Definitions
 * Based on official Angel One SmartAPI documentation
 */

export interface AngelOneLoginRequest {
  clientcode: string;
  password: string;
  totp: string;
}

export interface AngelOneLoginResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    jwtToken: string;
    refreshToken: string;
    feedToken: string;
  };
}

export interface AngelOneGenerateTokenRequest {
  refreshToken: string;
}

export interface AngelOneProfileResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    clientcode: string;
    name: string;
    email: string;
    mobileno: string;
    exchanges: string[];
    products: string[];
    lastlogintime: string;
    broker: string;
  };
}

export interface AngelOneRMSLimitResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    net: string;
    availablecash: string;
    availableintradaypayin: string;
    availablelimitmargin: string;
    collateral: string;
    m2munrealized: string;
    m2mrealized: string;
    utiliseddebits: string;
    utilisedspan: string;
    utilisedoptionpremium: string;
    utilisedholdingsales: string;
    utilisedexposure: string;
    utilisedturnover: string;
    utilisedpayout: string;
  };
}

export interface AngelOneErrorResponse {
  status: boolean;
  message: string;
  errorcode: string;
}

/**
 * Angel One Order Types
 */

export interface AngelOnePlaceOrderRequest {
  variety: string; // "NORMAL", "STOPLOSS", "AMO"
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: string; // "BUY", "SELL"
  exchange: string; // "NSE", "BSE", "NFO", "MCX", "BFO", "CDS"
  ordertype: string; // "MARKET", "LIMIT", "STOPLOSS_LIMIT", "STOPLOSS_MARKET"
  producttype: string; // "DELIVERY", "CARRYFORWARD", "MARGIN", "INTRADAY", "BO"
  duration: string; // "DAY", "IOC"
  price: string;
  squareoff?: string;
  stoploss?: string;
  quantity: string;
  triggerprice?: string;
}

export interface AngelOnePlaceOrderResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    script: string;
    orderid: string;
    uniqueorderid: string;
  };
}

export interface AngelOneOrderStatusRequest {
  orderid?: string;
  uniqueorderid?: string;
}

export interface AngelOneOrderStatus {
  variety: string;
  ordertype: string;
  producttype: string;
  duration: string;
  price: string;
  triggerprice: string;
  quantity: string;
  disclosedquantity: string;
  squareoff: string;
  stoploss: string;
  trailingstoploss: string;
  tradingsymbol: string;
  transactiontype: string;
  exchange: string;
  symboltoken: string;
  instrumenttype: string;
  strikeprice: string;
  optiontype: string;
  expirydate: string;
  lotsize: string;
  cancelsize: string;
  averageprice: string;
  filledshares: string;
  unfilledshares: string;
  orderid: string;
  text: string;
  status: string;
  orderstatus: string;
  updatetime: string;
  exchtime: string;
  exchorderupdatetime: string;
  fillid: string;
  filltime: string;
  parentorderid: string;
  uniqueorderid: string;
  orderstatusinfo?: string;
}

export interface AngelOneOrderStatusResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: AngelOneOrderStatus;
}

export interface AngelOneOrderBookResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: AngelOneOrderStatus[];
}

export interface AngelOneCancelOrderRequest {
  variety: string;
  orderid: string;
}

export interface AngelOneCancelOrderResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    orderid: string;
  };
}


/**
 * ===============================================
 * PORTFOLIO API TYPES (Day 4)
 * ===============================================
 */

/**
 * Position data from Angel One
 * 
 * Endpoint: GET /rest/secure/angelbroking/order/v1/getPosition
 */
export interface AngelOnePosition {
  exchange: string;               // "NSE", "BSE", "NFO", etc.
  symboltoken: string;            // Instrument token
  producttype: string;            // "DELIVERY", "INTRADAY", "MARGIN", "CARRYFORWARD"
  tradingsymbol: string;          // Symbol name
  symbolname: string;             // Full name
  instrumenttype: string;         // "EQ", "FUTIDX", "OPTSTK", etc.
  priceden: string;               // Price denominator
  pricenum: string;               // Price numerator
  genden: string;                 // General denominator
  gennum: string;                 // General numerator
  precision: string;              // Price precision
  multiplier: string;             // Contract multiplier
  boardlotsize: string;           // Board lot size
  buyqty: string;                 // Total buy quantity
  sellqty: string;                // Total sell quantity
  buyavgprice: string;            // Average buy price
  sellavgprice: string;           // Average sell price
  netqty: string;                 // Net quantity (buy - sell)
  netavgprice: string;            // Net average price
  totalbuyvalue: string;          // Total buy value
  totalsellvalue: string;         // Total sell value
  cfbuyqty: string;               // Carry forward buy quantity
  cfsellqty: string;              // Carry forward sell quantity
  cfbuyavgprice: string;          // CF buy average price
  cfsellavgprice: string;         // CF sell average price
  totalbuyavgprice: string;       // Total buy average price
  totalsellavgprice: string;      // Total sell average price
  netvalue: string;               // Net value
  
  // P&L fields
  close: string;                  // Close price
  ltp: string;                    // Last traded price
  pnl: string;                    // Profit and loss
  pnlpercentage: string;          // P&L percentage
  unrealised: string;             // Unrealized P&L
  realised: string;               // Realized P&L
}

export interface AngelOnePositionResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: AngelOnePosition[];
}

/**
 * Holding data from Angel One
 * 
 * Endpoint: GET /rest/secure/angelbroking/portfolio/v1/getHolding
 */
export interface AngelOneHolding {
  tradingsymbol: string;          // Symbol name
  exchange: string;               // "NSE", "BSE"
  isin: string;                   // ISIN code
  t1quantity: string;             // T+1 quantity
  realisedquantity: string;       // Realized quantity
  quantity: string;               // Total quantity
  authorisedquantity: string;     // Authorized quantity
  product: string;                // Product type
  collateralquantity: string;     // Collateral quantity
  collateraltype: string;         // Collateral type
  haircut: string;                // Haircut percentage
  averageprice: string;           // Average buy price
  ltp: string;                    // Last traded price
  symboltoken: string;            // Instrument token
  close: string;                  // Previous close price
  profitandloss: string;          // P&L amount
  pnlpercentage: string;          // P&L percentage
}

export interface AngelOneHoldingResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    holdings: AngelOneHolding[];
    totalholding: {
      totalholdingvalue: string;
      totalinvvalue: string;
      totalprofitandloss: string;
      totalpnlpercentage: string;
    };
  };
}

/**
 * Funds/RMS data from Angel One
 * 
 * Endpoint: GET /rest/secure/angelbroking/user/v1/getRMS
 */
export interface AngelOneFundsResponse {
  status: boolean;
  message: string;
  errorcode?: string;
  data: {
    net: string;                   // Net available funds
    availablecash: string;         // Available cash
    availableintradaypayin: string; // Available intraday payin
    availablelimitmargin: string;  // Available limit margin
    collateral: string;            // Collateral value
    m2munrealized: string;         // Mark-to-market unrealized
    m2mrealized: string;           // Mark-to-market realized
    utiliseddebits: string;        // Utilized debits
    utilisedspan: string;          // Utilized span margin
    utilisedoptionpremium: string; // Utilized option premium
    utilisedholdingsales: string;  // Utilized holding sales
    utilisedexposure: string;      // Utilized exposure margin
    utilisedturnover: string;      // Utilized turnover
    multiplier: string;            // Margin multiplier
  };
}
