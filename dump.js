// TODO:
// * rewrite this all to store activity metadata in sqlite maybe?
// * pull more data from the strava pages
// * reorder gpxdata to come after activity downloads
// * getActivities should look for newer activities so you can keep your db in
//   sync with strava
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

function readJSON(filename, defaultValue = null) {
  if (!fs.existsSync(filename)) {
    return defaultValue;
  }
  return JSON.parse(fs.readFileSync(filename));
}

function writeJSON(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data));
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
    const nogpx = readJSON("activities_without_gpx.json", []);

    // if we haven't already downloaded the gpx, and it's not listed as
    // missing, go get it
    if (!fs.existsSync(outfile) && !nogpx.includes(activityID)) {
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
              if (res.statusCode == 302) {
                nogpx.push(activityID);
                console.warn(
                  "no GPX data available for",
                  activityID,
                  res.statusCode
                );
                resolve();
                return;
              } else if (res.statusCode != 200) {
                reject(
                  `Got status code ${res.statusCode} on ${gpxURL}.\n${res}`
                );
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

    writeJSON("activities_without_gpx.json", nogpx);
  }
}

function pairs(arr) {
  return arr.reduce(function (result, value, index, array) {
    if (index % 2 === 0) result.push(array.slice(index, index + 2));
    return result;
  }, []);
}

async function downloadStravaData(page, activities) {
  const stravaData = readJSON("stravaData.json", {});

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

    process.stderr.write(".");
    stravaData[activityID] = {
      ...stats,
      ...moreStats,
    };
    writeJSON("stravaData.json", stravaData);
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
    // TODO: this doesn't handle expired cookies
    const cookies = readJSON(".creds.json");
    await page.setCookie(...cookies);
  } else {
    await login(page);
    writeJSON(".creds.json", await page.cookies());
  }

  // these are the titles and links to the runs we found
  if (!fs.existsSync("activities.json")) {
    writeJSON("activities.json", await getActivities(browser, page));
  }

  const activities = readJSON("activities.json");
  await downloadAllGPX(page, activities);
  await downloadStravaData(page, activities);

  await browser.close();
})();
