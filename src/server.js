import express from 'express'
import fs from 'fs'
import { connectToDb, db } from './db.js'
import admin from 'firebase-admin'
import path from 'path'
import 'dotenv/config'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const credentials = JSON.parse(
    fs.readFileSync('./credentials.json')
)

admin.initializeApp({
    credential: admin.credential.cert(credentials)
})

const app = express()

app.use(express.json())
app.use(express.static(path.join(__dirname, '../build')))

app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'))
})

app.use(async (req, res, next) => {
    // res.setHeader('Access-Control-Allow-Origin','http://localhost:3000')
    const { authToken } = req.headers

    if (authToken) {
        try {
            req.user = await admin.auth().verifyIdToken(authToken)
        } catch (error) {
            return res.sendStatus(404)
        }
    }

    req.user = req.user || {}

    next()
})
app.get('/api/articles/:name', async (req, res) => {
    const { name } = req.params
    const { uid } = req.user

    const article = await db.collection('articles').findOne({ name })

    if (article) {
        const upvoteIds = article.upvoteIds = []
        article.canUpVote = uid && !upvoteIds.includes(uid)
        res.json(article)
    } else {
        res.sendStatus(404).send('Article not found')
    }
})

app.use((req, res, next) => {
    if (req.user){
        next()
    } else {
        res.sendStatus(401)
    }
})

app.put('/api/articles/:name/upvote', async (req, res) => {
    const { name } = req.params
    const { uid } = req.user

    const article = await db.collection('articles').findOne({ name })

    if (article) {
        const upvoteIds = article.upvoteIds || []
        const canUpVote = uid && !upvoteIds.includes(uid)

        if (canUpVote) {
            await db.collection('articles').updateOne({ name }, {
                $inc: { upvotes: 1 },
                $push: { upvoteIds: uid }
            })
        }

        const updatedArticle = await db.collection('articles').findOne({ name })
        res.json(updatedArticle)
    } else {
        res.sendStatus(404).send(`That article doesn't exist`)
    }
})

app.post('/api/articles/:name/comments', async (req, res) => {
    const { text } = req.body
    const { name } = req.params
    const { email } = req.user

    await db.collection('articles').updateOne({ name }, {
        $push: { comments: { postedBy: email, text } }
    })
    const article = await db.collection('articles').findOne({ name })

    if (article) {
        res.json(article)
    } else {
        res.send(`That article doesn't exist`)
    }
})

const PORT = process.env.PORT || 8000

connectToDb(() => {
    console.log('Connected to database')
    app.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`)
    })
})
