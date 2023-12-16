
import axios from "@/axios";
import type { Article } from "@/types";
import { defineStore } from "pinia";
import { useReadingListStore } from "./readingList";

const STORED_ARTICLES = 5

export enum ArticleStatus {
    LOADING,
    READY,
    ERROR,
    OUT_OF_ARTICLES
}

export const useStartPageStore = defineStore({
    id: 'startPage',
    state: () => ({
        articles: [] as Article[],
        status: ArticleStatus.LOADING,
        lastActions: [] as Article[]
    }),
    actions: {
        async fetchArticles() {
            if (this.articles.length >= STORED_ARTICLES) {
                this.status = ArticleStatus.READY
                return
            }

            this.status = ArticleStatus.LOADING
            const response = await axios.get('/articles', {
                // TODO: set selected feeds
                params: {
                    limit: STORED_ARTICLES + this.articles.length
                }
            })

            if (response.status === 200) {
                for (const article of response.data) {
                    if (!this.articles.find(a => a.id === article.id)) {
                        this.articles.push(article)
                    }
                }
            } else {
                console.log(response)
            }

            if (this.articles.length < 1) {
                this.status = ArticleStatus.OUT_OF_ARTICLES
            } else {
                this.status = ArticleStatus.READY
            }
        },
        async _updateArticle(params: Partial<Article>) {
            const article = this.articles[0]
            if (params.seen) {
                this.articles.shift()
            }
            await axios.put(`/articles/${article.id}`, params)
            this.fetchArticles()
        },
        async saveArticle() {
            this.saveAction()
            await this._updateArticle({
                saved: true,
                seen: true
            })
            const readinglist = useReadingListStore();
            readinglist.update()
        },
        async discardArticle() {
            this.saveAction()
            this._updateArticle({
                seen: true
            })
        },
        saveAction() {
            this.lastActions.unshift(this.articles[0],
            )

            if (this.lastActions.length > 5) {
                this.lastActions.pop()
            }
        },
        revertAction() {
            if (this.lastActions.length === 0) {
                return
            }

            this.articles.unshift(this.lastActions.shift()!)
            this._updateArticle({
                saved: false,
                seen: false
            })
        }
    }
})