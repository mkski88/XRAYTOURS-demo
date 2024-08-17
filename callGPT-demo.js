//Import config to load environment variables from a .env file
import { config } from "dotenv";
config();

//Import the OpenAI
import OpenAI from 'openai';

//Initialize an instance of OpenAI using the API key from .env variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

//Route for information request
app.post('/ask', async (req, res) => {
    const title = req.body.title; //Wiki article title
    const type = req.body.type; //Type of request
    const lang = req.body.lang; //Language of request
    const titleL = req.body.titleL; //Latin title of the city or building

    const response = await callGPT(title, type, lang, titleL);

    res.json({ reply: response });
});

//Function to get response from GPT
async function callGPT(title, type, lang='be', titleL=null) {

    const isBuilding = type === 'building';
    //Count of paragraphs of wiki article
    let num = isBuilding ? 1 : 2;

    //Exception
    if (title === 'Горадня') { num = 4;}

    const tokens = isBuilding ? 256 : 1024; //Count of tokens for GPT
    const article = await getWikipediaArticle(title, num); //A piece of article from the wiki is needed for consumption

    //If article with that name doesnt exist
    if (article === 'Article not found') {
        return {
            style: 'Невядома',
            time: 'Невядома',
            population: 'Невядома',
            text: 'Невядома',
        };
    }

    //Prompt for building
    const buildingPrompt = `
        ${article}
        гэта артыкул пра помнік архітэктуры, вяртаемая інфармацыя павінна мець наступную структуру:
        Першы радок: толькі назвы стыляў, без дадатковых слоў або фраз, аддзеленыя коскамі.
        Калі стыль не можа быць вызначаны, неабходна праверыць, ці адносіцца будынак да "Гарадзенскай школы дойлідства" або "Полацкай школы дойлідства" або "Абарончага дойлідства" і ўказаць гэта.
        Напрыклад, "Гарадзенская школа дойлідства".
        Другі радок: час пабудовы помніка, выказаны ў стагоддзях (напрыклад, "XVII ст. - XVIII ст.").
        Усе адказы на запыты павінны быць прадстаўлены толькі на ${lang === 'be' ? 'беларускай' : 'ангельскай'} мове.`;

    //Prompt for city
    const baseRequest = `1. Укажыце колькасьць жыхароў населенага пункта (гарада ці вёскі) ў мільёнах, тысячах, сотнях або дзясятках чалавек, каб чытач мог уявіць яго памеры (напрыклад, '15 тыс. чал.'). 2. Напішыце кароткі, стрыманы пераказ артыкула пра гісторыю і архітэктуру населенага пункта (максымум 4 сказы!) у стылі турыстычнага даведніка. Тэкст павінен быць інфарматыўным і прызначаным для тых, хто не знаёмы з гарадамі Беларусі.`;
    const exampleRequest = (city) => `Першы радок: '15 тыс. чал.' \n Другі радок: 'Заслаўе — невялікі горад, размешчаны на рацэ Сьвіслач. Горад вядомы сваімі гістарычнымі і архітэктурнымі аб’ектамі, у тым ліку руінамі замка, былым кальвінскім зборам і касьцёлам у стылі віленскага барока. Заслаўе уваходзіць у склад гістарычна-культурнага запаведніка і мае значную спадчыну XVI—XVIII стагоддзяў.' Калі горад зараз знаходзіцца на тэрыторыі іншай краніны то удакладні гэта і напішы аб яго значнасьці для Беларускай культуры і гісторыі. Усе адказы павінны быць прадстаўлены толькі на ${lang === 'be' ? 'беларускай мове' : 'ангельскай мове. Name of the city in English is - '}${city}.`;
    const cityRequest = `${baseRequest} ${exampleRequest(titleL)}`;
    const cityPrompt = article + cityRequest;

    const prompt = isBuilding ? buildingPrompt : cityPrompt;

    //API call to chatGPT
    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt.trim() }],
        temperature: 0.4,
        max_tokens: tokens,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    });

    //Response processing
    const output = chatCompletion.choices[0].message.content.split('\n').map(line => line.trim());

    //Result for building
    if (isBuilding) {
        const style = output[0]
        return { style, time:output[1] };
    }
    //Result for city
    else {
        const population = output[0];
        const text = output[output.length > 2 ? 2 : 1]
            //Correction of possible mistakes
            .replace(/Vilnius/g, 'Vilnia')
            .replace(/Neris/g, 'Viliya')
        return { population, text };
    }
}

//Function to get part of article from wiki
async function getWikipediaArticle(articleTitle, numParagraphs = 1) {
    try {
        //Form a request to Wikipedia's API
        const response = await axios.get('https://be-tarask.wikipedia.org/w/api.php', {
            params: {
                action: 'query',      //Action to query data
                format: 'json',       //Response format
                titles: articleTitle, //Title of the article
                prop: 'extracts',     //Get the textual content of the page
                explaintext: true,    //Return the content as plain text without HTML
            },
        });

        //Extract the page content from response data
        const page = Object.values(response.data.query.pages)[0];
        const extract = page?.extract || 'Article not found'; //Default text if no extract

        //Return the first few paragraphs
        return extract.split('\n').slice(0, numParagraphs).join('\n');
    } catch (error) {
        console.error(error);
        return 'Error retrieving article';
    }
}
