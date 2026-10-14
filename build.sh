#!/bin/sh
# app.html(아티팩트 원본) → index.html(학생용) + public/index.html(기관 공유용, 보기 전용)
cd "$(dirname "$0")"
head='<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#1B2747">\n<meta name="description" content="%s">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n</head>\n'
{
  printf "$head" "구전남도청 AI 정보동아리 · 무장애 지도(오월의 길)와 평화 메시지 감성 분석(오월의 메아리)"
  printf '<body>\n'
  cat app.html
  printf '\n</body>\n</html>\n'
} > index.html
mkdir -p public
{
  printf "$head" "옛 전남도청·5·18 민주광장 무장애 지도와 방문 소감 · 조선대학교부속고등학교 학생 현장 조사(2026.10.14)"
  printf '<body class="public">\n'
  cat app.html
  printf '\n</body>\n</html>\n'
} > public/index.html
