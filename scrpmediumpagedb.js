// alg scraper of medium.com to cms pagekit db (sqlite)
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();

// alg input
// medium.com по поиску "криптовалют"
const startURL1 = "https://medium.com/search?q=%D0%BA%D1%80%D0%B8%D0%BF%D1%82%D0%BE%D0%B2%D0%B0%D0%BB%D1%8E%D1%82";
//  medium.com по тегу "криптовалюты"
const startURL2 = "https://medium.com/tag/%D0%BA%D1%80%D0%B8%D0%BF%D1%82%D0%BE%D0%B2%D0%B0%D0%BB%D1%8E%D1%82%D1%8B";
// регулярка с ключевыми словами по которым проверяем соответствие
const regex = /(?:Bitcoin|биткоин|Buterin|Бутерин|криптовалюта|криптовалют|Cryptocurrency|crypto-currencies|cryptocurrencies|mining|майнинг|майнит|майнят|Ethereum|Scala|Solidity|Blockchain|блокчейн)/gi;

//
var results = [];



async function scraper(startURL){

  try {
  const browser = await puppeteer.launch({headless: false});
      async function getLinks(){

        const page = await browser.newPage();
        await page.waitFor(2000);

        // alg1 go to website // заходим на сайт
        await page.goto(startURL);

        await page.waitFor(10000);
        await page.waitForSelector('.postArticle-readMore');

        let content = await page.content();
        var $ = cheerio.load(content);
        //var alltext = $("body").text();
        //console.log(alltext);
        var hrefs = [];

        //alg2 find links to posts // находим ссылки на посты
        $(".postArticle-readMore a").each(function(){
          item = {}
          item['link'] = $(this).attr('href');
          item['link'] = item['link'].replace(/\?source.*/, ''); //
          hrefs.push(item) // массив с готовыми ссылками
        });
        await page.close();
        return hrefs;
      };

      getLinks().then(function (result) {
        var links = [];
        for (name in result) {
          //console.log(result[name].link)

          //alg3 save links to posts // сохраняем ссылки на посты
          links.push(result[name].link)
          //console.log('\n')
        }
        console.dir(links);

        //alg4 form queue of links to posts // формируем из ссылок на посты очередь
        const series = links.reduce(async (queue, link) => {
          const dataArray = await queue;
          //
          dataArray.push(await getText(link));
          return dataArray;
        }, Promise.resolve([]));

        series.then(data => {

          console.log("work with db starts");
          console.dir(results);

          var db = new sqlite3.Database('pagekit.db');
          db.serialize(function(){
            db.run('DROP TABLE IF EXISTS new');

            // alg9 save content from array to db // сохраняем контент из массива в базу данных
            db.run('CREATE TABLE new (id INTEGER, user_id INTEGER UNSIGNED, slug VARCHAR (255), title VARCHAR (255), status SMALLINT, date DATETIME, modified DATETIME, content CLOB, excerpt CLOB, comment_status BOOLEAN, comment_count INTEGER, data CLOB, roles CLOB, link TEXT, time TEXT, keywords TEXT, likes TEXT)');
            var stmt = db.prepare('INSERT INTO new VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            for (var i = 0; i < results.length; i++) {
              stmt.run(results[i]);
            };
            stmt.finalize();
            // в родную базу pagekit в таблицу pk_blog_post нужно предварительно добавить 1 раз столбцы link, time, keywords, likes, state.
            db.run('CREATE TABLE IF NOT EXISTS pk_blog_post (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNSIGNED, slug VARCHAR (255), title VARCHAR (255), status SMALLINT, date DATETIME, modified DATETIME, content CLOB, excerpt CLOB, comment_status BOOLEAN, comment_count INTEGER, data CLOB, roles CLOB, link TEXT, time TEXT, keywords TEXT, likes TEXT, state TEXT)');
            db.run('UPDATE pk_blog_post set state = NULL');

            // alg output
            // alg10  check with db and save content only from new links // сверяем с базой и сохраняем в итоговую таблицу только контент из новых ссылок
            db.run('INSERT INTO pk_blog_post SELECT id, user_id, slug, title, status, date, modified, content, excerpt, comment_status, comment_count, data, roles, link, time, keywords, likes, "new" AS state FROM new ' +
            'WHERE link IN (SELECT link FROM new EXCEPT SELECT link FROM pk_blog_post)');
            db.run('DROP TABLE new');
            db.close();
          });

        })

      });

      const getText = async (link) => {
        console.log(`Now checking ${link}`);

        try {
          const page = await browser.newPage();

          await page.waitFor(1500);

          // alg5 open link to post from queue // открываем ссылку на пост в очереди
          await page.goto(link);

          await page.waitFor(3000);
          let content = await page.content();
          var $ = cheerio.load(content);
          //var alltext = $("body").text();
          //console.log(alltext);

          var subject = $("article").text();
          //console.log(subject);

          var keywords = subject.match(regex);
          var res = [];

          // alg6 check keywords // проверяем на соответствие ключевым словам
          if (keywords){
            var elhtmls = [];

            // alg7 find and parse content // находим и обрабатываем контент
            $("p, blockquote, figure").parent('.sectionLayout--insetColumn, .sectionLayout--fullWidth').each(function(i, element){
              var elhtml = $(this).html();
              var newelhtml1 = elhtml.replace(/<h1(.*?)h1>/g, "");
              var newelhtml2 = newelhtml1.replace(/<figure(.*?)canvas>/g, "");
              var newelhtml3 = newelhtml2.replace(/<noscript(.*?)figure>/g, "");
              var newelhtml4 = newelhtml3.replace(/data-src=/g, "src=");
              elhtmls.push(newelhtml4);
            });
            elhtmls.push('<p>_____________ <br> <a href="' + link + '">Источник</a> </p>');

            if($('*').is('h1')) {
              var title = $('h1').text();
            }
            else {
              var title = $('.sectionLayout--insetColumn p, .sectionLayout--insetColumn blockquote').first().text().split(' ').slice(0, 3).join(' ');
            };

            //var slug = title.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s/ig, '-');

            function translit(txt) {
              var str = txt;
              var space = '-';
              var sluglink = '';

              var transl = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
                'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
                'о': 'o', 'п': 'p', 'р': 'r','с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h',
                'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh','ъ': '',
                'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
              }
              if (str != '')
              str = str.toLowerCase();

              for (var i = 0; i < str.length; i++){
                if (/[а-яё]/.test(str.charAt(i))){ // заменяем символы на русском
                  sluglink += transl[str.charAt(i)];
                } else if (/[a-z0-9]/.test(str.charAt(i))){ // символы на анг. оставляем как есть
                  sluglink += str.charAt(i);
                } else {
                  if (sluglink.slice(-1) !== space) sluglink += space; // прочие символы заменяем на space
                }
              }
              return sluglink
            }

            var slug = translit(title);

            var datenow = new Date();
            var month = datenow.getMonth()+1;
            var datecur = datenow.getDate()-1; // минусован 1 день, чтобы пост сразу отображался в pagekit
            time_sec=datenow.getSeconds();
            time_min=datenow.getMinutes();
            time_hours=datenow.getHours();
            date=datenow.getFullYear() + "-" + month + "-" + datecur + " ";
            date+=((time_hours<10)?"0":"")+time_hours;
            date+=":";
            date+=((time_min<10)?"0":"")+time_min;
            date+=":";
            date+=((time_sec<10)?"0":"")+time_sec;

            var nn = null;

            // alg8 save content in an array // сохраняем контент поста в массив
            results.push([
              nn, // 1 id
              "1", // 2 user_id
              slug,  // 3 slug
              title, //4 title
              "3", // 5 status
              date, // 6 date
              date, // 7 modified
              elhtmls.join(" <br>"), // 8 content
              "//",    // 9 excerpt
              "1", // 10 comment_status,
              "0", // 11 comment_count
              '{"title":null,"markdown":false,"image":{"src":"","alt":""}}', // 12 data
              nn, // 13 roles
              link, // link
              $('time').first().text(), // time
              keywords.join(), // keywords
              $('.js-actionMultirecommendCount').first().text() // likes
            ]);
          };

          await page.close()
          return { res };
        } catch (error) {
          console.error(error);
          throw error;
        }
      };



    } catch (error) {
      console.error(error);
      throw error;
    }

    // alg end
    try {
      await browser.close();
    } catch (error) {
      console.error(error);
      throw error;
    }

};

// alg0 start scraping // запускаем  на скрапинг
scraper(startURL1);
scraper(startURL2);

