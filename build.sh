#!/bin/sh
# app.html(아티팩트 원본) → index.html(배포용 완전한 HTML 문서)
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#1B2747">\n<meta name="description" content="구전남도청 AI 정보동아리 · 무장애 지도(오월의 길)와 평화 메시지 감성 분석(오월의 메아리)">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n</head>\n<body>\n'
  cat app.html
  printf '\n</body>\n</html>\n'
} > index.html
