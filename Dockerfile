# ============================================================
# Dockerfile (Root Level) สำหรับการเอาขึ้น Railway / Cloud
# ============================================================
# ใช้ Node.js 18 เบาๆ (Alpine)
FROM node:18-alpine

# ตั้งโฟลเดอร์ทำงานหลักใน Container
WORKDIR /app

# ขั้นตอนที่ 1: คัดลอกเฉพาะ package.json มาติดตั้งก่อน (ช่วยประหยัดเวลา Build ครั้งหน้า)
COPY Backend/sysnect-node-api/package*.json ./Backend/sysnect-node-api/

# ติดตั้ง Dependencies เฉพาะตัวที่ใช้จริง (--production)
RUN cd Backend/sysnect-node-api && npm install --production

# ขั้นตอนที่ 2: คัดลอกไฟล์โปรเจกต์ "ทั้งหมด" (รวมโฟลเดอร์ html และ Backend) เข้าไป
COPY . .

# เปิดพอร์ต 3000 สำหรับให้ Cloud เชื่อมต่อ
EXPOSE 3000

# ขั้นตอนที่ 3: สั่งให้ Container ไปทำงานที่โฟลเดอร์ Backend และรัน server.js
WORKDIR /app/Backend/sysnect-node-api
CMD ["npm", "start"]
