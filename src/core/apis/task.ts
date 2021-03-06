import * as moment from "moment";
import * as math from "mathjs";
import { getGoodsSellingList,
    parseGoodsSellingList,
    getGoodsBuyingList,
    parseGoodsBuyingList,
 } from "../services";
import { Task, Status, Goods } from "../model";
import xlsx = require("better-xlsx");
import * as fs from "fs";
import { NotFoundError } from "routing-controllers";
import { IUser, ROLE } from "../model/user";

export const doTask = async (userId, gameName= "csgo", startPage: number = 1, endPage: number, type: string) => {
    let desc;
    if (type === "selling") {
        desc = `于${moment().format("YYYY-MM-DD, h:mm:ss a")}创建的爬取${gameName}的Buff出售价格，从第${startPage}页到第${endPage === -1 ? "最后一" : endPage}页的任务单`;
    } else if (type === "buying") {
        desc = `于${moment().format("YYYY-MM-DD, h:mm:ss a")}创建的爬取${gameName}的Buff收购价格，从第${startPage}页到第${endPage === -1 ? "最后一" : endPage}页的任务单`;
    }
    const task = await Task.create({
        user: userId,
        desc,
        gameName,
        type,
    });

    let res = [];

    try {
        (async () => {
            let nowPage = 1;
            const crawlFunc: any = type === "selling" ? getGoodsSellingList : getGoodsBuyingList;
            const parseFunc: any = type === "selling" ? parseGoodsSellingList : parseGoodsBuyingList;
            // const promiseList = range(endPage);
            for (; nowPage <= endPage || endPage === -1; nowPage++) {
                const goodsList = await crawlFunc(gameName, nowPage);
                if (endPage === -1) {
                    endPage = goodsList.data.total_page;
                }
                console.log(nowPage, goodsList.data.items.length);
                res = [...res, ...(goodsList.data.items as any).filter((g) => Number(g.sell_min_price) >= 2 && Number(g.sell_min_price) <= 3000)];
            }
            // await promiseList.forEach((p) => {
                // getGoodsList(gameName, p)
                // .then((goodsList) => {
                //     console.log(p, goodsList.data.items.length);
                //     res = [...res, ...goodsList.data.items.filter((g) => Number(g.sell_min_price) >= 2 && Number(g.sell_min_price) <= 3000)];
                // });
            // });
            const rawResult = JSON.stringify(parseFunc(res));
            const timeConsuming = `${(new Date().getTime() - new Date(task.createdAt).getTime()) / 1000}s`;
            await task.update({ status: Status.success, rawResult, timeConsuming });

            // .map((p) => getGoodsList(gameName, p)
            //     .then((goodsList) => {
            //         console.log(p, goodsList.data.items.length);
            //         res = [...res, ...goodsList.data.items.filter((g) => Number(g.sell_min_price) >= 2 && Number(g.sell_min_price) <= 3000)];
            //         return true;
            //     }));
            // Promise.all(promiseList)
            // .then(async () => {
                // const rawResult = JSON.stringify(parseGoodsList(res));
                // const timeConsuming = `${(new Date().getTime() - new Date(task.createdAt).getTime()) / 1000}s`;
                // await task.update({ status: Status.success, rawResult, timeConsuming });
            // });
        })();
    } catch (err) {
        await task.update({ status: Status.fail });
    }

    return {
        error: 0,
        msg: "成功",
        data: task,
    };
};

export const getTask = async (user: IUser, taskId: string) => {
    const conditions = user.role.includes(ROLE.ADMIN) ? { _id: taskId } : { _id: taskId, user: user._id };
    return await Task.findOne(conditions, "-rawResult").populate("user", "username");
};

export const getTaskList = async (user: IUser) => {
    const conditions = user.role.includes(ROLE.ADMIN) ? {} : { user: user._id };
    try {
        return await Task.find(conditions, "-rawResult")
        .sort("-createdAt")
        .populate("user", "username");
    } catch (err) {
        await Task.deleteMany({});
        return await Task.find(conditions, "-rawResult")
            .sort("-createdAt")
            .populate("user", "username");
    }
};

export const deleteTask = async (user: IUser, taskId: string) => {
    const conditions = user.role.includes(ROLE.ADMIN) ? { _id: taskId } : { _id: taskId, user: user._id };
    await Task.deleteOne(conditions);
    return {
        error: 0,
        msg: "成功",
    };
};

export const taskResultExport = async (user: IUser, taskId: string) => {
    const conditions = user.role.includes(ROLE.ADMIN) ? { _id: taskId } : { _id: taskId, user: user._id };
    const task = await Task.findOne(conditions);
    if (!task) {
        throw new NotFoundError();
    }
    const file = new xlsx.File();
    const sheet = file.addSheet("DefaultSheet");

    switch (task.type) {
        case "selling": {
            const row = sheet.addRow();
            const cell1 = row.addCell();
            cell1.value = "商品名";
            const cell2 = row.addCell();
            cell2.value = "Buff出售最低价（单位：元）";
            const cell3 = row.addCell();
            cell3.value = "steam出售价格（单位：元）";
            const cell4 = row.addCell();
            cell4.value = "steam最大收购价（单位：元）";
            const cell5 = row.addCell();
            cell5.value = "steam最小出售价（单位：元）";
            const cell6 = row.addCell();
            cell6.value = "收购价-buff出售最低价";
            const cell7 = row.addCell();
            cell7.value = "倍数";
            const cell8 = row.addCell();
            cell8.value = "Buff在售数量";
            // const cell9 = row.addCell();
            // cell9.value = "原始折扣价（百分比）";
            const cell10 = row.addCell();
            cell10.value = "原始利润（百分比）";
            const cell11 = row.addCell();
            cell11.value = "Buff商品链接";
            const cell12 = row.addCell();
            cell12.value = "steam商品链接";
            const cell13 = row.addCell();
            cell13.value = "商品唯一标识名称";

            const rawResult = JSON.parse(task.rawResult);
            for (const r of rawResult) {
                let steamMaxBuyPrice = "";
                let steamMinSellPrice = "";
                const goods = await Goods.findOne({ marketHashName: r.market_hash_name, steamMaxBuyPrice: {$exists: true}, steamMinSellPrice: {$exists: true} });
                if (goods) {
                    steamMaxBuyPrice = goods.steamMaxBuyPrice.substr(2);
                    steamMinSellPrice = goods.steamMinSellPrice.substr(2);
                }
                const dataRow = sheet.addRow();
                const dataCell1 = dataRow.addCell();
                const dataCell2 = dataRow.addCell();
                const dataCell3 = dataRow.addCell();
                const dataCell4 = dataRow.addCell();
                const dataCell5 = dataRow.addCell();
                const dataCell6 = dataRow.addCell();
                const dataCell7 = dataRow.addCell();
                const dataCell8 = dataRow.addCell();
                // const dataCell9 = dataRow.addCell();
                const dataCell10 = dataRow.addCell();
                const dataCell11 = dataRow.addCell();
                const dataCell12 = dataRow.addCell();
                const dataCell13 = dataRow.addCell();
                dataCell1.value = r.name;
                dataCell2.value = r.sell_min_price;
                dataCell3.value = r.steam_price_cny;
                dataCell4.value = steamMaxBuyPrice;
                dataCell5.value = steamMinSellPrice;
                dataCell6.value = steamMaxBuyPrice !== "" ? math.eval(`${steamMaxBuyPrice} * 0.85 - ${r.sell_min_price}`) : "";
                dataCell7.value = steamMaxBuyPrice !== "" ? math.eval(`${r.sell_min_price} / ${steamMaxBuyPrice}`) : "";
                dataCell8.value = r.sell_num;
                // dataCell9.value = r.original_discount_price;
                dataCell10.value = steamMaxBuyPrice !== "" ? math.eval(`(${steamMaxBuyPrice} * 0.85 - ${r.sell_min_price}) / ${steamMaxBuyPrice}`) : "";
                dataCell11.value = r.buff_goods_url;
                dataCell12.value = r.steam_market_url;
                dataCell13.value = r.market_hash_name;
            }
            break;
        }
        case "buying": {
            const row = sheet.addRow();
            const cell1 = row.addCell();
            cell1.value = "商品名";
            const cell2 = row.addCell();
            cell2.value = "Buff收购最高价（单位：元）";
            const cell3 = row.addCell();
            cell3.value = "Buff出售最低价（单位：元）";
            const cell4 = row.addCell();
            cell4.value = "Buff收购最高价 - Buff出售最低价";
            const cell5 = row.addCell();
            cell5.value = "steam最小出售价（单位：元）";
            const cell6 = row.addCell();
            cell6.value = "steam最小出售价 - Buff收购最高价";
            const cell7 = row.addCell();
            cell7.value = "Buff求购数量";
            const cell8 = row.addCell();
            cell8.value = "Buff商品链接";
            const cell9 = row.addCell();
            cell9.value = "steam商品链接";
            const cell10 = row.addCell();
            cell10.value = "商品唯一标识名称";

            const rawResult = JSON.parse(task.rawResult);
            for (const r of rawResult) {
                let steamMinSellPrice = "";
                const goods = await Goods.findOne({ marketHashName: r.market_hash_name, steamMaxBuyPrice: {$exists: true}, steamMinSellPrice: {$exists: true} });
                if (goods) {
                    steamMinSellPrice = goods.steamMinSellPrice.substr(2);
                }
                const dataRow = sheet.addRow();
                const dataCell1 = dataRow.addCell();
                const dataCell2 = dataRow.addCell();
                const dataCell3 = dataRow.addCell();
                const dataCell4 = dataRow.addCell();
                const dataCell5 = dataRow.addCell();
                const dataCell6 = dataRow.addCell();
                const dataCell7 = dataRow.addCell();
                const dataCell8 = dataRow.addCell();
                const dataCell9 = dataRow.addCell();
                const dataCell10 = dataRow.addCell();
                dataCell1.value = r.name;
                dataCell2.value = r.buy_max_price;
                dataCell3.value = r.sell_min_price;
                dataCell4.value = math.eval(`${r.buy_max_price} - ${r.sell_min_price}`);
                dataCell5.value = steamMinSellPrice;
                dataCell6.value = steamMinSellPrice !== "" ? math.eval(`${steamMinSellPrice} - ${r.buy_max_price}`) : "";
                dataCell7.value = r.buy_num;
                dataCell8.value = r.buff_goods_url;
                dataCell9.value = r.steam_market_url;
                dataCell10.value = r.market_hash_name;
            }
            break;
        }
    }

    const fileName = `${Math.random() * 1000000}.xlsx`;

    file
        .saveAs()
        .pipe(fs.createWriteStream(__dirname + `/../export/${fileName}`));

    await task.update({ resultUrl: fileName });

    return {
        error: 0,
        msg: "成功",
        data: {},
    };
};
