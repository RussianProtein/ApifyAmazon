const Apify = require('apify');
const cheerio = require('cheerio');

const { log, enqueueLinks } = Apify.utils;
const { scrapeDetailsPage } = require('./getItems.js');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const input = await Apify.getValue('INPUT');

    const { proxy, domain, categoryUrls, depthOfCrawl } = input;
    // Select which domain to scrape
    if (categoryUrls && categoryUrls.length > 0) {
        for (const categoryRequest of categoryUrls) {
            await requestQueue.addRequest({
                url: categoryRequest.url,
                userData: { detailPage: true, depthOfCrawl: 1 },
            }); // we it is not detail but it is how it was :)
        }
    } else {
        await requestQueue.addRequest({ url: domain });
    }

    const proxyConfiguration = await Apify.createProxyConfiguration(proxy);

    const crawler = new Apify.PuppeteerCrawler({
        maxRequestRetries: 15,
        maxConcurrency: 10, // To prevent too many browser activity
        requestQueue,
        proxyConfiguration,
        useSessionPool: true,
        launchPuppeteerOptions: {
            headless: true,
            stealth: true,
            useChrome: false,
            stealthOptions: {
                addPlugins: false,
                emulateWindowFrame: false,
                emulateWebGL: false,
                emulateConsoleDebug: false,
                addLanguage: false,
                hideWebDriver: true,
                hackPermissions: false,
                mockChrome: false,
                mockChromeInIframe: false,
                mockDeviceMemory: false,
            },
        },
        handlePageFunction: async ({ request, page, response, session }) => {
            // get and log category name
            const title = await page.title();
            const statusCode = await response.status();
            log.info(`Processing: ${title}. Depth: ${request.userData.depthOfCrawl},`
                + `is detail page: ${request.userData.detailPage} URL: ${request.url}`+ `TITLE: ${request.userData.titleCat}` );

                var titleOne = null;
                var titleTwo = null;
                var titleThree = null;


            const pageData = { category: title, prevcat: request.userData.titleCat, categoryUrl: request.url, };

                            
            console.log(`Сканирование категории ${title}`);

            // Loading cheerio for easy parsing, remove if you wish
            const html = await page.content();
            const $ = cheerio.load(html);

            // We handle this separately to get info
            if ($('[action="/errors/validateCaptcha"]').length > 0) {
                session.retire();
                throw `[CAPTCHA]: Status Code: ${response.statusCode}`;
            }

            if (html.toLowerCase().includes('robot check')) {
                session.retire();
                throw `[ROBOT CHECK]: Status Code: ${response.statusCode}.`;
            }

            if (!response || (statusCode !== 200 && statusCode !== 404)) {
                session.retire();
                throw `[Status code: ${statusCode}]. Retrying`;
            }

            // Enqueue main category pages on the Best Sellers homepage
            if (!request.userData.detailPage) {
                console.log('А что тут?');
                console.log(request.userData.depthOfCrawl);
                pageData.depth = 1;
                pageData.title = title;
                pageData.CategoryID = request.userData.categoryID;
                pageData.CategoryIDCurrent = request.id;
                var data = await enqueueLinks({
                    page,
                    requestQueue,
                    limit:2,
                    selector: 'div > ul > ul > li > a',
                    transformRequestFunction: (req) => {
                        req.userData.detailPage = true;
                        req.userData.depthOfCrawl = 1;
                        req.userData.titleCat = title;
                        req.userData.categoryID = request.id;
                        return req;
                    },
                });
                console.log(data);
            }

            // Enqueue second subcategory level
            if (depthOfCrawl > 1 && request.userData.depthOfCrawl === 1) {
                console.log('Тест');
                console.log(request.userData.depthOfCrawl);
                pageData.depth = 1;
                pageData.title = title;
                pageData.CategoryID = request.userData.categoryID;
                pageData.CategoryIDCurrent = request.id;
                var data = await enqueueLinks({
                    page,
                    requestQueue,
                    limit:2,
                    selector: 'ul > ul > ul > li > a',
                    transformRequestFunction: (req) => {
                        req.userData.detailPage = true;
                        req.userData.depthOfCrawl = 2;
                        req.userData.titleCat = title;
                        req.userData.categoryID = request.id;
                        return req;
                    },
                });

                console.log(data);

            }

            // if (depthOfCrawl > 2 && request.userData.depthOfCrawl === 2) {
            //     pageData.depth = 2;
            //     await enqueueLinks({
            //         page,
            //         requestQueue,
            //         selector: 'ul > ul > ul > ul > li > a',
            //         transformRequestFunction: (req) => {
            //             req.userData.detailPage = true;
            //             req.userData.depthOfCrawl = 3;
            //             return req;
            //         },
            //     });
            // }

            // ADD IN CASE MORE DATA IS NEEDED (ADDING 3RD SUBCATEGORY LEVEL)
            // // Enqueue 3rd subcategory level
            if (depthOfCrawl > 1 && request.userData.depthOfCrawl === 2) {
                console.log('Цыпа');
                console.log(request.userData.depthOfCrawl);
                pageData.depth = 3;
                pageData.title = title;
                pageData.CategoryID = request.userData.categoryID;
                pageData.CategoryIDCurrent = request.id;
                await enqueueLinks({
                    page,
                    requestQueue,
                    limit:2,
                    selector: 'ul > ul > ul > ul > li > a',
                    transformRequestFunction: (req) => {
                        req.userData.detailPage = true;
                        req.userData.depthOfCrawl = 3;
                        req.userData.titleCat = title;
                        req.userData.categoryID = request.id;
                        return req;
                    },
                });
            }

            // Log number of pending URLs (works only locally)
            // log.info(`Pending URLs: ${requestQueue.pendingCount}`);

            // Scrape items from enqueued pages
            if (request.userData.detailPage) {
                await scrapeDetailsPage(page, pageData);
            }
        },
    });

    await crawler.run();
    log.info('Crawl complete.');
});
