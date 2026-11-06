# LAB 0 · เช็กเครื่อง

📋 เปิด Claude Code เซสชันใหม่ที่โฟลเดอร์ `sabaijang/` แล้ววางกล่องนี้

```text
ตรวจเครื่องให้พร้อมสำหรับบทนี้ ทุกค่าต้องมาจากคำสั่งที่รันจริง (ห้ามแก้ไฟล์ · ติดตั้งได้แค่ playwright-cli ในข้อ 5)
1. Docker Desktop เปิดอยู่ไหม: docker version และ docker compose version
2. Node.js: node -v (ต้อง 20 ขึ้นไป) และ npm -v
3. ffmpeg -version (ใช้ทำ GIF ตอนทดสอบ)
4. พอร์ต 3100 (เว็บ) และ 5434 (ฐานข้อมูล) ว่างไหม ถ้ามีอะไรใช้อยู่ให้บอกชื่อ (ยังไม่ต้องปิด) · บอกด้วยว่าพอร์ต 3000 / 5433 ของเว็บสปาเปิดอยู่ไหม (เปิดอยู่ได้ ไม่ชนกัน)
5. playwright-cli --version ถ้าไม่มีให้ npm install -g @playwright/cli@latest · จากนั้นลองเปิดเบราว์เซอร์ 2 ตัวพร้อมกัน ชื่อ a และ b (playwright-cli -s=a open https://example.com) แล้ว playwright-cli list ต้องเห็น 2 ตัว แล้วปิดทั้งหมด
6. โฟลเดอร์นี้มี interview/INTERVIEW.md, interview/OWNER-ANSWERS.md และ brand-kit/ ไหม นับจำนวนรูปใน brand-kit แยกตามโฟลเดอร์ย่อย และมี brand-kit/CREDITS.md ไหม
สรุปเป็นตาราง: รายการ | ผล | พร้อมไหม | ถ้าไม่พร้อมต้องทำอะไร
```
