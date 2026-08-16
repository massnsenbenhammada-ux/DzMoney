import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DzMoney</title>

      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #08111f;
          color: white;
          font-family: Arial, sans-serif;
        }

        .box {
          width: 90%;
          max-width: 400px;
          padding: 30px;
          text-align: center;
          border-radius: 24px;
          background: #101d30;
          border: 1px solid #1e3855;
        }

        h1 {
          margin-bottom: 10px;
        }

        p {
          color: #91a5bb;
        }

        .status {
          margin-top: 20px;
          padding: 14px;
          border-radius: 14px;
          background: #123d2a;
          color: #72e6a1;
        }
      </style>
    </head>

    <body>

      <div class="box">

        <h1>💎 DzMoney</h1>

        <p>
          Telegram Mini App
        </p>

        <div class="status">
          ✅ Server is running
        </div>

      </div>

    </body>
    </html>
  `);
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});

app.listen(PORT, () => {
  console.log(`DzMoney running on port ${PORT}`);
});
