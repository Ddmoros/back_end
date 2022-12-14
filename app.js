/* This is importing the necessary packages to run the app. */
const express = require('express')
const app = express()
const mustacheExpress = require('mustache-express')
var bcrypt = require('bcryptjs');
var session = require('express-session')
const models = require('./models')
const { Op } = require('sequelize')
const formidable = require ('formidable')
const {v4:uuidv4} = require ('uuid') 
const db = require('./models');
const path = require ('path');
const { url } = require('inspector');

global.__basedir = __dirname
const VIEWS_PATH = path.join(__dirname, '/views')

/* mustache engine to be used in the app. */
app.engine('mustache', mustacheExpress(VIEWS_PATH + '/partials','.mustache')) 
app.set('views', VIEWS_PATH)
app.set('view engine', 'mustache')
app.use(express.urlencoded())

/* the session to be used in the app. */
app.use(session({
    secret: 'keyboard cat', 
    resave: false,
    saveUninitialized: true
}))

/*  a route that is rendering the found_posts page. */
app.use('/styles_images', express.static ('styles_images'))
app.use('/uploads', express.static ('uploads'))
app.use('/css', express.static ('css'))

/*  ------Login-Registration-Logout-AuthenticationMiddleware-Dashboard (Rob's Work)------ */
app.get('/login', (req, res) => {
    res.render('login')
})

app.post('/login', async (req, res) => {
    const {username, password } = req.body
    const user = await models.user.findOne({
        where: {
            username: username
        }
    })
    if(user){
        const result = await bcrypt.compare(password, user.password)
        if(result) {
            if(req.session) {
                req.session.userId = user.id
                req.session.username = user.username 
            }
            res.redirect('dashboard')
        } else {
        
        res.render('login', {errorMessage: 'Invalid username or password'})
    }}
})

app.get('/logout', authentication, (req,res)=>{
    req.session.destroy()
    res.redirect('login')
})

function authentication(req, res, next) {
    if(req.session) {
        if(req.session.username) {
            next()
        } else {
            res.redirect('/login')
        }
    } else {
        res.redirect('/login')
    }
}

app.get('/register', (req, res) => {
    res.render('register')
})

app.post('/register', async (req, res) => {
    const {firstName, lastName, email, phoneNumber, zipCode, username, password } = req.body
    let salt = await bcrypt.genSalt(10)
    let hashedPassword = await bcrypt.hash(password, salt)
    
    const user = await models.user.create({
        first_name:firstName, last_name:lastName, email:email, phone_number:phoneNumber, zip_code:zipCode, username:username, password:hashedPassword
    })

    let user_upload = await user.save()

    res.redirect('login')
})

app.get('/dashboard', authentication, (req, res) =>{
    const username = req.session.username 
    const userId = req.session.userId

    res.render('dashboard', {username: req.session.username, userId: req.session.userId})
})

app.get('/found_posts', async (req, res) => {
    let result = await models.found_animal.findAll({})
    res.render('found_posts', {result:result})
})

/*  ------File Upload code (Dmitry's Work)------   */
let uniqueFileName = '';

function uploadFile(req, callback) {
    new formidable.IncomingForm ().parse (req)
    .on('fileBegin', (name, file) => {
        
        uniqueFileName = `${uuidv4()}.${file.originalFilename.split(".").pop()}`;
        file.name = uniqueFileName
        file.filepath = __basedir + '/uploads/' + file.name

    })
    .on ('file', (name, file) => {
        callback(file.name)

    })
}

app.post('/upload', (req, res) => {
    uploadFile(req,(photoURL) => {
        photoURL = `/uploads/${photoURL}`
        res.render('add_lost_post', {imageURL: photoURL, className: 'pet-preview-image'})
    })
})


/*  ------Lost Pages Post/Comment/etc (Dmitry's Work)------   */

app.get('/my_posts', authentication, async (req, res) => {
    const username = req.session.username
    const userId = req.session.userId
    
    const post_detail_lost = await models.lost_post.findAll({where: {user_fk:userId}})
    let lostComments = await models.lost_comment.findAll({})
    for (let post of post_detail_lost) {
        let filteredComments = lostComments.filter(comment => comment.lost_fk == post.id)
        post.comment = filteredComments
    }
    
    let result = await models.found_post.findAll({where: {user_fk:userId}})
    let comments = await models.found_comment.findAll({})
    for (let post of result) {
        let filteredComments = comments.filter(comment => comment.found_fk == post.id)
        post.comment = filteredComments
    }
    
    res.render('my_posts', {
        myPostsLost: post_detail_lost, 
        result:result,
        username: req.session.username})
})


app.post('/delete-MyLostPost', async(req, res) =>  {
    let {id} = req.body
    await models.lost_comment.destroy({where:{lost_fk:id}})
    await models.lost_post.destroy({where:{id:parseInt(id)}})
    res.redirect(`my_posts`)
}) 

app.post('/deleteMyLostComment/:id', async(req, res) => {  
    let {id} = req.params
    await models.lost_comment.destroy({where:{id:id}})
    res.redirect(`/my_posts`)
})
app.post('/delete-MyFoundPost', async(req, res) =>  {
    let {id} = req.body
    await models.found_comment.destroy({where:{found_fk:id}})
    await models.found_post.destroy({where:{id:parseInt(id)}})
    res.redirect(`/my_posts`)
}) 

app.post('/deleteMyFoundComment/:id', async(req, res) => {  
    let {id} = req.params
    await models.found_comment.destroy({where:{id:id}})
    res.redirect(`/my_posts`)
})



app.get('/lost_posts', authentication, async (req, res) => {
    res.render('lost_posts')
})

app.get('/add_lost_post', authentication, async (req,res)=>{
    res.render('add_lost_post')
})

app.post ('/add_lost_post',  async (req,res)=>{
    const defaultImage  = "noImage.jpg"
    const userId = req.session.userId
    let lost_animal;
    let {species, color, breed, gender, name, size, age, zipCode, description, dateLost } =  req.body 
    if(uniqueFileName == '') {
        lost_animal = await models.lost_post.build ({
                species: species, 
                color: color,
                breed: breed,
                gender: gender,
                name: name, 
                size: size, 
                age: age, 
                zip_code: zipCode, 
                description: description, 
                pet_pic: defaultImage,
                date_lost: dateLost,
                user_fk: userId
    })} else {
        lost_animal = await models.lost_post.build ({
            species: species, 
            color: color,
            breed: breed,
            gender: gender,
            name: name, 
            size: size, 
            age: age, 
            zip_code: zipCode, 
            description: description, 
            pet_pic: uniqueFileName, 
            date_lost: dateLost,
            user_fk: userId
    })}
    let upload_lost_animal = await lost_animal.save()
    if (upload_lost_animal != null) {
        res.redirect('/lost-animals')
    } else {
        res.alert ( {message: 'Unable to add your animal to a database. Please, try again!'})
    }
})



app.get ('/lost-animals', async (req,res) => {
    
    const username = req.session.username 
    const userId = req.session.userId
    
    let lost_animals = await models.lost_post.findAll({})
    let comments =await models.lost_comment.findAll({})
    for (let post of lost_animals) {
        let filteredComments = comments.filter(comment => comment.lost_fk == post.id)
        post.comment = filteredComments
    }
    res.render('lost_posts', {allAnimals:lost_animals})
})


app.get ('/postComment/:id', authentication, async (req,res) => {
    const username = req.session.username 
    const userId = req.session.userId
    
    res.render('add_lost_comment', {id:req.params.id})
})

app.get('/lost-animals/:id', authentication, async (req,res) => {
    const username = req.session.username 
    const userId = req.session.userId

    const postID = req.params.id
    const post_detail = await models.lost_post.findAll({where: {id:postID}})

    let comments =await models.lost_comment.findAll({})
    for (let post of post_detail) {
        let filteredComments = comments.filter(comment => comment.lost_fk == post.id)
        post.comment = filteredComments}

    let allComments = post_detail[0].comment

    res.render('all_comments_for_post', {details: post_detail, lost_comment: allComments})
   
})

app.get('/show-comments/:id', authentication, async (req,res) => {
    const username = req.session.username 
    const userId = req.session.userId
    
    const postID = req.params.id
    const post = await models.lost_post.findOne({
        include: [
            {
                model: models.lost_comment,
                as: 'lost_comments'
            }
        ],
        where: {
            id: postID
        }
    })
    res.render('all_comments_for_post', post.dataValues)
    
})




   // const postID = parseInt(req.params.id)

app.post ('/add-comments', authentication, async (req, res) =>{
    const username = req.session.username 
    const userId = req.session.userId

    const {description, id} = req.body
    let comment = await models.lost_comment.build({
        body:description,
        lost_fk:parseInt(id)
    })
    let savedComment = await comment.save()
    if(savedComment) {
        res.redirect(`/lost-animals/${id}`)
    } else {
        res.render('add_lost_comments')
    }
})

/*  ------Found Pages Post/Comment/etc(Daniel's Work)------   */

/*   route that is rendering the found_posts page. */
app.get('/found-posts', async (req, res) => {
    const username = req.session.username 
    const userId = req.session.userId
    
    let result = await models.found_post.findAll({})
    let comments = await models.found_comment.findAll({})
    for (let post of result) {
        let filteredComments = comments.filter(comment => comment.found_fk == post.id)
        post.comment = filteredComments
    }
    res.render('found_posts', {result:result, comments:comments, username: req.session.username})
})

app.get('/add_found_post', authentication, async (req, res) => {
    res.render('add_found_post', {username: req.session.username, userId: req.session.userId})
} )

/*  adding a new post to found-posts */
app.post('/found-posts', authentication, async (req, res) => {

    const username = req.session.username 
    const userId = req.session.userId

    let {species, color, breed, gender, name, size, age, zipCode, description, dateFound} = req.body    

    let found_animal = await models.found_post.build({
        species: species,
        color: color,
        breed: breed,
        gender: gender,
        name: name,
        size: size,
        age: age,
        zip_code: zipCode,
        description: description,
        date_found: dateFound,
        user_fk: userId
    })
   await found_animal.save()
   res.render('/found-posts',)
})
/* deleting the post from the database. */
app.post('/delete-post', async(req, res) =>  {
    let {id} = req.body
    await models.found_comment.destroy({where:{found_fk:id}})
    await models.found_post.destroy({where:{id}})
    res.redirect('/found-posts')
}) 

app.post('/comments', async(req, res) => {
    
    let {comment,id} = req.body

    await models.found_comment.create({body:comment,found_fk:id})
    res.redirect('/found-posts')
})

app.post('/deleteFoundPost/:id', async(req, res) => {
    
    let {id} = req.params

    await models.found_comment.destroy({where:{id:id}})
    res.redirect('/found-posts')
})

/*  ------Server Stuff------   */
app.listen(3000,() => {
    console.log('Server is running...')
})                        