import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    user_balance: number
) => {
    //Merge strategy
    if (condition === 'merge') {
        console.log('Merging Strategy...');
        if (!my_position) {
            console.log('my_position is undefined');
            trade.bot = true;
            return;
        }
        let remaining = my_position.size;
        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                console.log('No bids found');
                trade.bot = true;
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);
            let order_arges;
            if (remaining <= parseFloat(maxPriceBid.size)) {
                order_arges = {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    amount: remaining,
                    price: parseFloat(maxPriceBid.price),
                };
            } else {
                order_arges = {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    amount: parseFloat(maxPriceBid.size),
                    price: parseFloat(maxPriceBid.price),
                };
            }
            console.log('Order args:', order_arges);
            // Validate order amount is positive
            if (order_arges.amount <= 0) {
                console.log('Invalid order amount - skipping');
                break;
            }
            
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount;
                // Small delay after successful order
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                retry += 1;
                console.log(`Error posting order: retrying... (${retry}/${RETRY_LIMIT})`, resp);
                // Delay before retry to avoid spamming API
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
        if (retry >= RETRY_LIMIT) {
            trade.bot = true;
            trade.botExcutedTime = retry;
        } else {
            trade.bot = true;
        }
    } else if (condition === 'buy') {       //Buy strategy
        console.log('Buy Strategy...');
        
        // Validate denominator to prevent division by zero
        const denominator = user_balance + trade.usdcSize;
        if (denominator <= 0) {
            console.log('Invalid user balance or trade size - cannot calculate ratio');
            trade.bot = true;
            return;
        }
        
        // Validate my balance is sufficient
        if (my_balance <= 0) {
            console.log('Insufficient balance - cannot execute buy order');
            trade.bot = true;
            return;
        }
        
        const ratio = my_balance / denominator;
        console.log('ratio', ratio);
        let remaining = trade.usdcSize * ratio;
        
        // Ensure remaining doesn't exceed available balance
        remaining = Math.min(remaining, my_balance);
        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                console.log('No asks found');
                trade.bot = true;
                break;
            }

            const minPriceAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);

            console.log('Min price ask:', minPriceAsk);
            if (parseFloat(minPriceAsk.price) - 0.05 > trade.price) {
                console.log('Too big different price - do not copy');
                trade.bot = true;
                break;
            }
            let order_arges;
            if (remaining <= parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price)) {
                order_arges = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: remaining,
                    price: parseFloat(minPriceAsk.price),
                };
            } else {
                order_arges = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price),
                    price: parseFloat(minPriceAsk.price),
                };
            }
            console.log('Order args:', order_arges);
            // Validate order amount is positive
            if (order_arges.amount <= 0) {
                console.log('Invalid order amount - skipping');
                break;
            }
            
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount;
                // Small delay after successful order
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                retry += 1;
                console.log(`Error posting order: retrying... (${retry}/${RETRY_LIMIT})`, resp);
                // Delay before retry to avoid spamming API
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
        if (retry >= RETRY_LIMIT) {
            trade.bot = true;
            trade.botExcutedTime = retry;
        } else {
            trade.bot = true;
        }
    } else if (condition === 'sell') {          //Sell strategy
        console.log('Sell Strategy...');
        let remaining = 0;
        if (!my_position) {
            console.log('No position to sell');
            trade.bot = true;
        } else if (!user_position) {
            remaining = my_position.size;
        } else {
            const ratio = trade.size / (user_position.size + trade.size);
            console.log('ratio', ratio);
            remaining = my_position.size * ratio;
        }
        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                trade.bot = true;
                console.log('No bids found');
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);
            
            // Price slippage check for sell (similar to buy)
            const bidPrice = parseFloat(maxPriceBid.price);
            if (trade.price && bidPrice + 0.05 < trade.price) {
                console.log('Too big price difference for sell - do not copy');
                trade.bot = true;
                break;
            }
            
            let order_arges;
            if (remaining <= parseFloat(maxPriceBid.size)) {
                order_arges = {
                    side: Side.SELL,
                    tokenID: trade.asset,
                    amount: remaining,
                    price: bidPrice,
                };
            } else {
                order_arges = {
                    side: Side.SELL,
                    tokenID: trade.asset,
                    amount: parseFloat(maxPriceBid.size),
                    price: bidPrice,
                };
            }
            console.log('Order args:', order_arges);
            // Validate order amount is positive
            if (order_arges.amount <= 0) {
                console.log('Invalid order amount - skipping');
                break;
            }
            
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remaining -= order_arges.amount;
                // Small delay after successful order
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                retry += 1;
                console.log(`Error posting order: retrying... (${retry}/${RETRY_LIMIT})`, resp);
                // Delay before retry to avoid spamming API
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
        if (retry >= RETRY_LIMIT) {
            trade.bot = true;
            trade.botExcutedTime = retry;
        } else {
            trade.bot = true;
        }
    } else {
        console.log('condition not supported');
    }
};

export default postOrder;
