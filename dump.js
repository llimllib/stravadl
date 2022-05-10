const fs = require("fs");
const https = require("https");

const puppeteer = require("puppeteer");

async function login(page) {
  await page.goto("https://www.strava.com/login");
  await page.waitForSelector("#email");

  await page.type("#email", process.env.STRAVA_USER);
  await page.type("#password", process.env.STRAVA_PASS);
  await page.click("#login-button");

  // wait for the home page to load
  await page.waitForSelector("#athlete-profile");
}

async function getActivities(browser, page) {
  // go to the training page, which lists activities
  await page.goto("https://www.strava.com/athlete/training");

  const activities = [];
  let next;

  do {
    await page.waitForSelector(".training-activity-row");
    let newrows = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#search-results tr.training-activity-row")
      );
      const data = rows.map((row) => {
        return Array.from(row.querySelectorAll("td")).map((td) =>
          td.innerHTML.trim()
        );
      });
      return data;
    });

    activities.push(...newrows);

    // if the next button isn't disabled, gclick on it
    next = await page.$(".next_page:not(.disabled)");
    if (next) {
      await next.click();

      // not clear to me why browser.on works here but page.waitFor... doesn't
      // :shrug:
      //
      // await page.waitForNavigation({ waitUntil: "networkidle2" });
      await browser.on("targetchanged");

      process.stderr.write(`${activities.length}.`);
    }
  } while (next);
  process.stderr.write("\n");

  return activities;
}

async function downloadAllGPX(page, activities) {
  for (const activity of activities) {
    const activityID = activity[2].match(/activities\/(\d+)/)[1];

    const gpx_url = `https://www.strava.com/activities/${activityID}/export_gpx`;
    const outfile = `gpxdata/${activityID}.gpx`;

    // if we haven't already downloaded the gpx, go get it
    if (!fs.existsSync(outfile)) {
      console.log("downloading", gpx_url);

      const cookies = await page.cookies();

      // https://help.apify.com/en/articles/1929322-handling-file-download-with-puppeteer
      // https://stackoverflow.com/a/65306839/42559
      await new Promise((resolve, reject) => {
        https
          .get(
            gpx_url,
            {
              headers: {
                Cookie: cookies.map((ck) => ck.name + "=" + ck.value).join(";"),
              },
            },
            (res) => {
              // If there is no GPX file for the activity, strava returns a 302
              if (res.statusCode != 200) {
                console.log(
                  "no GPX data available for",
                  activityID,
                  res.statusCode
                );
                resolve();
                return;
              }

              const stream = fs.createWriteStream(outfile);
              res.pipe(stream);
              stream.on("finish", () => {
                stream.close();
                resolve();
              });
            }
          )
          .on("error", (err) => {
            console.error("error", err);
            reject(err);
          });
      });
    }
  }
}

function pairs(arr) {
  return arr.reduce(function (result, value, index, array) {
    if (index % 2 === 0) result.push(array.slice(index, index + 2));
    return result;
  }, []);
}

async function downloadStravaData(page, activities) {
  let stravaData;
  if (fs.existsSync("stravaData.json")) {
    stravaData = JSON.parse(fs.readFileSync("stravaData.json"));
  } else {
    stravaData = {};
  }

  for (const activity of activities) {
    const activityID = activity[2].match(/activities\/(\d+)/)[1];

    await page.goto(`https://www.strava.com/activities/${activityID}`);
    await page.waitForSelector("ul.inline-stats");
    const stats = await page.evaluate(() => {
      return Object.fromEntries(
        Array.from(document.querySelectorAll("ul.inline-stats li")).map((li) =>
          li.innerText.split("\n").reverse()
        )
      );
    });

    const moreStats = Object.fromEntries(
      pairs(
        await page.evaluate(() => {
          return Array.from(document.querySelectorAll(".more-stats div.row"))
            .map((row) =>
              Array.from(row.querySelectorAll("div")).map(
                (div) => div.innerText
              )
            )
            .flat();
        })
      )
    );

    // TODO: there are many
    process.stderr.write(".");
    stravaData[activityID] = {
      ...stats,
      ...moreStats,
    };
    fs.writeFileSync("stravaData.json", JSON.stringify(stravaData));
  }
  process.stderr.write("\n");
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1024,
      height: 768,
    },
  });
  const page = await browser.newPage();

  if (fs.existsSync(".creds.json")) {
    const cookies = JSON.parse(fs.readFileSync(".creds.json"));
    await page.setCookie(...cookies);
  } else {
    await login(page);
    fs.writeFileSync(".creds.json", JSON.stringify(await page.cookies()));
  }

  // these are the titles and links to the runs we found
  if (!fs.existsSync("activities.json")) {
    fs.writeFileSync(
      "activities.json",
      JSON.stringify(await getActivities(browser, page))
    );
  }

  const activities = JSON.parse(fs.readFileSync("activities.json"));
  // await downloadAllGPX(page, activities);
  await downloadStravaData(page, activities);

  await browser.close();
})();
