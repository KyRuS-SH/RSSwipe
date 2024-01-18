import { PrismaClient } from "@prisma/client";
import { environment } from "../helper/environment";
import { getPrismaClient } from "../prismaClient";

const prisma = getPrismaClient();

export function initGarbageCollector(intervall = Number(environment.garbageCollectorInterval)) {
    console.log("Initialising garbage collector with interval of " + intervall + "ms");
    setInterval(async () => {
        try {
            await deleteOldArticles();
            await deleteExpiredArticlesFromReadingList();
            await deleteUnusedFeeds();
        } catch (err) {
            console.error(err);
        }
    }, intervall);
}

async function deleteUnusedFeeds() {
    try {
        let deletedFeeds = 0;

        const feeds = await prisma.feed.findMany();

        for (const feed of feeds) {
            if (!await isFeedUsed(feed.id)) {
                await prisma.feed.delete({
                    where: {
                        id: feed.id
                    }
                });
                deletedFeeds++;
            }
        }

        console.log(`Deleted ${deletedFeeds} unused Feeds`);
    } catch (err) {
        console.error("\nError while deleting old feeds: \n" + err);
    }
}

async function isFeedUsed(feedId: string) {
    // Check if feed has articles
    const articles = await prisma.article.findMany({
        where: {
            feedId: feedId
        }
    });

    // Check if any user follows the feed
    const feedLists = await prisma.feedList.findMany({
        where: {
            feedId: feedId
        }
    });

    return articles.length > 0 || feedLists.length > 0;
}

async function deleteOldArticles() {
    try {
        let deletedArticles = 0;

        const articles = await prisma.article.findMany({
            where: {
                OR: [
                    {
                        publishedAt: {
                            lt: new Date(Date.now() - Number(environment.maxArticleAge))
                        }
                    },
                    {
                        createdAt: {
                            lt: new Date(Date.now() - Number(environment.maxArticleAge))
                        }
                    }
                ]

            }
        });

        for (const article of articles) {
            const isUsed = await isArticleUsed(article.id);
            if (!isUsed) {
                await prisma.article.delete({
                    where: {
                        id: article.id
                    }
                });
                deletedArticles++;
            }
        }

        console.log(`Deleted ${deletedArticles} old Articles`);
    } catch (err) {
        console.error("\nError while deleting old articles: \n" + err);
    }
}

async function isArticleUsed(articleId: string) {
    const articleLists = await prisma.articleList.findMany({
        where: {
            articleId: articleId
        }
    });

    for (const articleList of articleLists) {
        if (articleList.saved || articleList.starred) {
            return true;
        }
    }

    return false;
}

export async function deleteExpiredArticlesFromReadingList(userId?: string) {
    const now = new Date();
    let settings;

    // Get all user settings to determine the expiration times
    if (userId) {
        settings = await prisma.settings.findMany({
            where: {
                userId: userId
            }
        });
    } else {
        settings = await prisma.settings.findMany();
    }

    for (const setting of settings) {
        // Calculate the time threshold for read and unread articles based on user settings
        const readExpirationDate = new Date(now.getTime() - setting.expTimeRead);
        const unreadExpirationDate = new Date(now.getTime() - setting.expTimeUnread);

        const where = []

        if (setting.expTimeRead >= 0) {
            where.push({
                AND: [
                    { userId: setting.userId },
                    { read: true },
                    { dateRead: { lt: readExpirationDate } }
                ]
            })
        }

        if (setting.expTimeUnread >= 0) {
            where.push({
                AND: [
                    { userId: setting.userId },
                    { read: false },
                    { dateSaved: { lt: unreadExpirationDate } }
                ]
            })
        }

        // Find all articles from the reading list that have expired
        const expiredArticles = await prisma.articleList.findMany({
            where: {
                OR: where
            },
            select: {
                articleId: true
            }
        });

        // Delete all articles that have expired for this user
        for (const expiredArticle of expiredArticles) {
            await prisma.articleList.update({
                where: {
                    articleId_userId: { // Change this line to match the unique identifier
                        userId: setting.userId,
                        articleId: expiredArticle.articleId
                    }
                },

                data: {
                    saved: false,
                }
            });
        }

    }
    console.log("Expired articles from the reading list have been cleaned up.");
}


